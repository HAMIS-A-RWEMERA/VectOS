import multer from 'multer';
import path from 'path';

// Serverless-safe (Netlify/Lambda): always use memory storage.
// The Lambda filesystem is read-only except /tmp, so disk storage
// and module-load directory creation would crash cold starts.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|mp4|webm|quicktime|xlsx|xls|csv/;
    const extname = allowedTypes.test(require('path').extname(file.originalname).toLowerCase());

    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('File format not supported. Allowed formats: images, videos, XLSX, XLS, CSV.'));
    }
  },
});

export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max spreadsheet file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
    }
  }
});
