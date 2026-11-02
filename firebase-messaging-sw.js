// Background push for the website (Chrome). Keep this file next to index.html in the GitHub repo.
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyCqdMDjbMiraiBryV_IclyRSzwE7Qhy85c",
  authDomain: "eshu-memories--shop.firebaseapp.com",
  projectId: "eshu-memories--shop",
  storageBucket: "eshu-memories--shop.firebasestorage.app",
  messagingSenderId: "254149281483",
  appId: "1:254149281483:web:1407b83bc8bc8924ab3d4e"
});
// FCM itself shows messages that carry a "notification" block and opens webpush.fcmOptions.link when tapped.
firebase.messaging();
