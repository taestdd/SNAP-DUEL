import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

declare global {
  // eslint-disable-next-line no-var
  var _firebaseAdminApp: App | undefined;
  // eslint-disable-next-line no-var
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
