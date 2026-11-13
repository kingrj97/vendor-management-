const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const sharp = require("sharp");

// 1. Upload folder
const uploadDirectory = path.resolve(__dirname, "..", "..", "uploads");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

// 2. Allowed file types
const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];

const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];

// 3. File storage configuration
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${randomUUID()}${extension}`;

    callback(null, uniqueName);
  }
});

// 4. Validate file type (mimetype + extension dono)
const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !allowedMimeTypes.includes(file.mimetype) ||
    !allowedExtensions.includes(extension)
  ) {
    const error = new Error(
      "Only PDF, JPG, JPEG and PNG files are allowed."
    );
    error.status = 400;

    return callback(error);
  }

  callback(null, true);
};

// 5. Upload configuration
// Incoming file limit is 25 MB.
// Images will be compressed after upload.
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 16,     // form me 16 attachment fields hain
    fields: 100,
    parts: 150
  }
});

// Uploaded files ke paths nikalo
function getUploadedPaths(req) {
  if (!req.files || Array.isArray(req.files)) {
    return [];
  }

  return Object.values(req.files)
    .flat()
    .map((file) => file.path);
}

// Files delete karo, error ignore karo
async function removeFiles(filePaths) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File pehle hi delete ho chuki ho sakti hai
      }
    })
  );
}

// 6. Compress uploaded JPG and PNG images
async function compressUploadedFiles(req, res, next) {
  const temporaryFiles = [];

  try {
    const uploaded = req.files;

    if (!uploaded || Array.isArray(uploaded)) {
      return next();
    }

    for (const files of Object.values(uploaded)) {
      for (const file of files) {

        // PDF files are not compressed by Sharp.
        if (
          file.mimetype !== "image/jpeg" &&
          file.mimetype !== "image/png"
        ) {
          continue;
        }

        const tempPath = `${file.path}.compressed`;
        temporaryFiles.push(tempPath);

        if (file.mimetype === "image/jpeg") {
          await sharp(file.path)
            .rotate()
            .resize({
              width: 2000,
              height: 2000,
              fit: "inside",
              withoutEnlargement: true
            })
            .jpeg({ quality: 75 })
            .toFile(tempPath);
        } else {
          await sharp(file.path)
            .rotate()
            .resize({
              width: 2000,
              height: 2000,
              fit: "inside",
              withoutEnlargement: true
            })
            .png({ compressionLevel: 9 })
            .toFile(tempPath);
        }

        const compressedSize = (
          await fs.promises.stat(tempPath)
        ).size;

        // Replace original only if compressed file is smaller.
        if (compressedSize < file.size) {
          await fs.promises.rename(tempPath, file.path);
          file.size = compressedSize;
        } else {
          await fs.promises.unlink(tempPath);
        }

        const index = temporaryFiles.indexOf(tempPath);

        if (index !== -1) {
          temporaryFiles.splice(index, 1);
        }
      }
    }

    return next();

  } catch (error) {

    // Temporary compression files + upload ki hui saari files delete karo
    await removeFiles([
      ...temporaryFiles,
      ...getUploadedPaths(req)
    ]);

    // Corrupt / fake image ke liye user-friendly 400 error
    const friendlyError = new Error(
      "One of the uploaded images is invalid or corrupted."
    );
    friendlyError.status = 400;

    return next(friendlyError);
  }
}

// Export middleware
module.exports = {
  upload,
  compressUploadedFiles
};