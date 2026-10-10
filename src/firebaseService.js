import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
} from "firebase/database";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const firebaseConfigured = Object.values(config).every(Boolean);

let auth;
let database;

function getServices() {
  if (!firebaseConfigured) {
    throw new Error("Remote sessions are not configured. Add your Firebase web-app values to .env.local first.");
  }

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  auth = getAuth(app);
  database = getDatabase(app);
  return { auth, database };
}

async function getAnonymousUser() {
  const { auth: currentAuth } = getServices();
  if (currentAuth.currentUser) return currentAuth.currentUser;
  const result = await signInAnonymously(currentAuth);
  return result.user;
}

function randomRoomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;

export async function createRemoteRoom() {
  const user = await getAnonymousUser();
  const { database: db } = getServices();
  const roomId = randomRoomId();
  const now = Date.now();

  await set(ref(db, `rooms/${roomId}/info`), {
    ownerUid: user.uid,
    createdAt: now,
    expiresAt: now + ROOM_LIFETIME_MS,
    status: "active",
  });
  await set(ref(db, `rooms/${roomId}/members/${user.uid}`), true);

  return { roomId, uid: user.uid, expiresAt: now + ROOM_LIFETIME_MS };
}

export async function joinRemoteRoom(roomId) {
  if (!/^[a-f0-9]{32}$/.test(roomId)) {
    throw new Error("This session link is not valid.");
  }

  const user = await getAnonymousUser();
  const { database: db } = getServices();
  const infoSnapshot = await get(ref(db, `rooms/${roomId}/info`));

  if (!infoSnapshot.exists()) {
    throw new Error("Session not found. Check the link with the person who created it.");
  }

  const info = infoSnapshot.val();
  if (!info.expiresAt || Date.now() >= info.expiresAt || info.status !== "active") {
    throw new Error("This session has expired. Create a new session link.");
  }

  await set(ref(db, `rooms/${roomId}/members/${user.uid}`), true);
  return { roomId, uid: user.uid, expiresAt: info.expiresAt };
}

export function listenToRemoteMessages(roomId, onMessages, onError) {
  const { database: db } = getServices();
  return onValue(
    ref(db, `rooms/${roomId}/messages`),
    (snapshot) => {
      const value = snapshot.val() || {};
      const messages = Object.entries(value)
        .map(([id, message]) => ({ id, ...message }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      onMessages(messages);
    },
    (error) => onError?.(error),
  );
}

export async function sendRemoteMessage(roomId, text, senderLabel) {
  const user = await getAnonymousUser();
  const { database: db } = getServices();
  const cleanText = String(text || "").trim();

  if (!cleanText) throw new Error("Enter a message first.");
  if (cleanText.length > 2000) throw new Error("Messages must be 2,000 characters or fewer.");

  const messagesRef = ref(db, `rooms/${roomId}/messages`);
  const messageRef = push(messagesRef);
  await set(messageRef, {
    text: cleanText,
    sender: String(senderLabel || "Guest").slice(0, 40),
    senderUid: user.uid,
    createdAt: Date.now(),
  });
}
