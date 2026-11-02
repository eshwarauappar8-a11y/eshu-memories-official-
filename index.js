// Eshu Memories: automatic push notifications (Realtime Database triggers + FCM).
// Deploy:  firebase deploy --only functions
const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
// IMPORTANT: this region must match your Realtime Database location (us-central1 for eshu-memories--shop).
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = admin.database();
const USER_SITE = "https://eshwarauappar8-a11y.github.io/eshu-memories/"; // customer website (repo 1)
const ADMIN_SITE = "https://eshwarauappar8-a11y.github.io/eshu-admin/";     // admin website (repo 2): change "eshu-admin" to your admin repo name
const short = (id) => String(id).slice(-8).toUpperCase(); // same "#XXXXXXXX" the app shows

// Idempotency: the first call for a key wins, retries/duplicates are ignored.
async function claim(key) {
  const res = await db.ref("notifyLog/" + key).transaction((v) => (v ? undefined : { at: Date.now() }));
  return res.committed;
}

async function tokensOf(uid) {
  const snap = await db.ref("fcmTokens/" + uid).get();
  const v = snap.val() || {};
  return Object.entries(v).filter(([, t]) => t && t.token).map(([key, t]) => ({ uid, key, token: t.token }));
}

// Send to a list of {uid,key,token} and delete tokens FCM says are dead.
async function push(list, title, body, data, link) {
  if (!list.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens: list.map((x) => x.token),
    notification: { title, body },
    data, // strings only
    webpush: {
      notification: { icon: USER_SITE + "icon-192.png", badge: USER_SITE + "icon-192.png" },
      fcmOptions: { link },
      headers: { Urgency: "high" },
    },
    android: {
      priority: "high",
      notification: { channelId: "orders", icon: "ic_stat_notify", color: "#1D5BE0", sound: "default" },
    },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = (r.error && r.error.code) || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) dead.push(list[i]);
    else console.warn("FCM send failed:", code);
  });
  await Promise.all(dead.map((x) => db.ref(`fcmTokens/${x.uid}/${x.key}`).remove()));
}

async function saveInApp(uid, key, n) {
  await db.ref(`notifications/${uid}/${key}`).set({ ...n, read: false, createdAt: Date.now() });
}

// A) New order -> every admin device
exports.notifyAdminNewOrder = onValueCreated("/orders/{orderId}", async (event) => {
  const orderId = event.params.orderId;
  if (!(await claim("new_" + orderId))) return;
  const adminsSnap = await db.ref("admins").get(); // only the Firebase console can write /admins
  const adminUids = Object.entries(adminsSnap.val() || {}).filter(([, v]) => v).map(([uid]) => uid);
  const title = "Eshu Memories – New Order! 🛍️";
  const body = `A new order has been received. Order ID: #${short(orderId)}`;
  let all = [];
  for (const uid of adminUids) {
    await saveInApp(uid, "new_" + orderId, { title, body, orderId, type: "new_order", eventId: "new_" + orderId });
    all = all.concat(await tokensOf(uid));
  }
  await push(all, title, body, { target: "admin_order", orderId, type: "new_order" }, ADMIN_SITE + "#order=" + orderId);
});

// B) Status changed to exactly "Out for Delivery" -> only that customer
exports.notifyCustomerOutForDelivery = onValueUpdated("/orders/{orderId}", async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (!before || !after) return;
  if (after.status !== "Out for Delivery" || before.status === after.status) return;
  const orderId = event.params.orderId;
  const uid = after.userId; // field name used by the app
  if (!uid) return;
  if (!(await claim("ofd_" + orderId))) return;
  const title = "Eshu Memories – Out for Delivery! 🚚";
  const body = `Your order #${short(orderId)} is out for delivery. Please be ready to receive your parcel.`;
  await saveInApp(uid, "ofd_" + orderId, { title, body, orderId, type: "order", eventId: "ofd_" + orderId });
  await push(await tokensOf(uid), title, body, { target: "customer_orders", orderId, type: "order" }, USER_SITE + "index.html?go=orders");
});
