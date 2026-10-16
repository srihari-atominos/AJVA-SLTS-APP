/**
 * upload.middleware.js
 * Multer config for XML extract uploads — memory storage (files are parsed
 * immediately in vehicles.service, never written to disk), limits from
 * config.js (UPLOAD_MAX_FILE_MB / UPLOAD_MAX_FILES).
 */
const multer = require('multer');
const config = require('../../config');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
    files: config.upload.maxFiles,
  },
});

module.exports = { upload };
