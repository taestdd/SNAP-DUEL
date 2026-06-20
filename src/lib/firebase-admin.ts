import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

declare global {
  var _firebaseAdminApp: App | undefined;
  var _firebaseAdminDb: Firestore | undefined;
}

export function getAdminDb(): Firestore {
  if (!globalThis._firebaseAdminDb) {
    const app =
      globalThis._firebaseAdminApp ??
      (globalThis._firebaseAdminApp = getApps()[0] ?? initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
      }));
    globalThis._firebaseAdminDb = getFirestore(app);
  }
  return globalThis._firebaseAdminDb;
}
