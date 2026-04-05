import { Router } from "express";
import multer from "multer";
import path from "path";

export const filesRouter = Router();

// Store uploads in memory temporarily before sending to Firebase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// ─── POST /api/files/upload — Upload a file to Firebase Storage ───────────────

filesRouter.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const fileName = `${sessionId}/${Date.now()}_${path.basename(req.file.originalname)}`;
    const url = await uploadToFirebase(req.file.buffer, fileName, req.file.mimetype);

    res.json({
      name: req.file.originalname,
      url,
      sizeBytes: req.file.size,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Upload a buffer to Firebase Storage.
 * Returns the public download URL.
 */
async function uploadToFirebase(buffer, fileName, mimeType) {
  // Lazy-load firebase-admin to avoid crashing if credentials aren't set up yet
  const admin = await import("firebase-admin").then((m) => m.default);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(fileName);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: true,
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "01-01-2030",
  });

  return url;
}
