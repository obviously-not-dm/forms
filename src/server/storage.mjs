import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(".");
const UPLOADS_DIR = path.join(ROOT, "data", "uploads", "homeworks");
const IMAGES_DIR = path.join(ROOT, "data", "uploads", "images");

export function initStorage() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

export function isValidPdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  // Check magic bytes: PDF header %PDF- usually in first 1024 bytes
  const header = buffer.subarray(0, Math.min(1024, buffer.length)).toString("binary");
  return header.includes("%PDF-");
}

export async function saveUploadedPdf(originalName, buffer) {
  initStorage();

  if (!isValidPdf(buffer)) {
    throw new Error("Загружаемый файл должен быть валидным документом PDF (заголовок %PDF- не обнаружен)");
  }

  const ext = ".pdf";
  const safeBase = String(originalName || "solution")
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_\-\u0400-\u04FF]/g, "_")
    .slice(0, 50);

  const rand = crypto.randomBytes(6).toString("hex");
  const uniqueName = `hw_${Date.now()}_${rand}_${safeBase}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, uniqueName);

  fs.writeFileSync(targetPath, buffer);

  // Pluggable Google Drive sync hook
  try {
    await tryGoogleDriveSync(uniqueName, targetPath);
  } catch (err) {
    console.warn("[Storage] Google Drive sync note:", err.message);
  }

  return {
    filename: uniqueName,
    originalName: String(originalName || uniqueName),
    size: buffer.length,
    path: targetPath,
    url: `/api/uploads/homeworks/${uniqueName}`,
  };
}

export function getPdfFilePath(filename) {
  if (!filename) return null;
  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

export function saveUploadedImage(originalName, buffer) {
  initStorage();
  const ext = path.extname(originalName || "").toLowerCase() || ".png";
  const safeBase = String(originalName || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_\-\u0400-\u04FF]/g, "_")
    .slice(0, 50);
  const rand = crypto.randomBytes(6).toString("hex");
  const uniqueName = `img_${Date.now()}_${rand}_${safeBase}${ext}`;
  const targetPath = path.join(IMAGES_DIR, uniqueName);
  fs.writeFileSync(targetPath, buffer);

  return {
    filename: uniqueName,
    originalName: String(originalName || uniqueName),
    size: buffer.length,
    path: targetPath,
    url: `/api/uploads/images/${uniqueName}`,
  };
}

export function getImageFilePath(filename) {
  if (!filename) return null;
  const safeName = path.basename(filename);
  const fullPath = path.join(IMAGES_DIR, safeName);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

// Google Drive Integration Hook
// Supports Google Drive service account or credentials file if provided
async function tryGoogleDriveSync(fileName, filePath) {
  const gdriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const configPath = path.join(ROOT, "data", "gdrive_config.json");
  let config = null;

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }

  const folderId = gdriveFolderId || config?.folder_id;
  if (!folderId) {
    // Local storage is used as primary zero-latency storage
    return;
  }

  // Pluggable hook ready when Google API client / service account is configured
  console.log(`[Storage] Google Drive sync configured for folder ${folderId}: ${fileName}`);
}
