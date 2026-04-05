import { Router } from "express";
import multer from "multer";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

export const filesRouter = Router();

// ─── Cloudinary config ────────────────────────────────────────────────────────
// Initialised once when the module loads.
// Credentials come from .env — never hardcode these.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer — keep file in memory before uploading to Cloudinary ──────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// ─── POST /api/files/upload ───────────────────────────────────────────────────

filesRouter.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    // Build a clean public_id: wkai/sessionId/timestamp_filename
    // Cloudinary uses public_id as the file path inside your account
    const baseName   = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const publicId   = `wkai/${sessionId}/${Date.now()}_${baseName}`;

    const url = await uploadToCloudinary(req.file.buffer, publicId, req.file.mimetype);

    res.json({
      name:      req.file.originalname,
      url,
      sizeBytes: req.file.size,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Upload helper ────────────────────────────────────────────────────────────

/**
 * Uploads a file buffer to Cloudinary and returns the secure download URL.
 *
 * resource_type "raw" handles all non-image files (PDFs, .py, .zip, etc.)
 * For images it auto-detects, but "raw" is safer for workshop files.
 *
 * @param {Buffer} buffer
 * @param {string} publicId    e.g. "wkai/session-123/1234567890_notes"
 * @param {string} mimeType    e.g. "application/pdf"
 * @returns {Promise<string>}  secure HTTPS download URL
 */
function uploadToCloudinary(buffer, publicId, mimeType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",   // handles PDFs, code files, zip, etc.
        public_id:     publicId,
        overwrite:     false,
        // Makes the file directly downloadable rather than displayed inline
        type:          "upload",
      },
      (error, result) => {
        if (error) return reject(error);
        // secure_url is always HTTPS — use this, not url
        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer);
  });
}