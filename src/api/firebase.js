import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD3O1zaa02Gd9ztpEQ05jsaPLZQKQHXtc4",
  authDomain: "signal-54014.firebaseapp.com",
  projectId: "signal-54014",
  storageBucket: "signal-54014.firebasestorage.app",
  messagingSenderId: "1008047994395",
  appId: "1:1008047994395:web:6c2115cd01cd57c1632abe",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use long polling to avoid WebSocket/fetch interception issues from browser extensions
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);
export default app;
