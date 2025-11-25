import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
        projectId: "golden-bonbon-327902", // Explicitly set project ID
    });
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true }); // Good practice

export { admin };
