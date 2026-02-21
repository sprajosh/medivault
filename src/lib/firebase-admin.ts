import { initializeApp, cert, ServiceAccount } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: ReturnType<typeof initializeApp> | null = null;

function initializeAdmin() {
  if (adminApp) {
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.error("DEBUG: Missing env vars for firebase-admin");
    return null;
  }

  const serviceAccount: ServiceAccount = {
    projectId,
    privateKey,
    clientEmail,
  };

  console.log("DEBUG: Initializing firebase-admin with projectId:", projectId);
  
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: projectId,
  });
  
  console.log("DEBUG: firebase-admin initialized successfully");
  
  return adminApp;
}

export function getAdminDb() {
  const app = initializeAdmin();
  if (!app) {
    console.error("DEBUG getAdminDb: app is null");
    return null;
  }
  
  const db = getFirestore(app);
  console.log("DEBUG getAdminDb: firestore created");
  return db;
}

export async function verifyIdToken(idToken: string) {
  try {
    const app = initializeAdmin();
    if (!app) {
      console.error("Firebase Admin SDK initialization failed");
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
