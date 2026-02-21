import { initializeApp, getApps, cert, ServiceAccount } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function initializeAdmin() {
  const existingApps = getApps();
  
  const defaultApp = existingApps.find(app => !app.name || app.name === "[DEFAULT]");
  if (defaultApp) {
    return defaultApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.error("Missing env vars for firebase-admin");
    return null;
  }

  const serviceAccount: ServiceAccount = {
    projectId,
    privateKey,
    clientEmail,
  };

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export function getAdminDb() {
  const app = initializeAdmin();
  if (!app) {
    return null;
  }
  return getFirestore(app);
}

export async function verifyIdToken(idToken: string) {
  try {
    const app = initializeAdmin();
    if (!app) {
      return null;
    }
    
    const adminAuth = getAdminAuth(app);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}
