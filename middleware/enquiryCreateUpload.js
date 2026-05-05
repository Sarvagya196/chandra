const multer = require('multer');

const MAX_MB = parseInt(process.env.MAX_REFERENCE_FILE_MB, 10) || 50;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
});

// Accept up to 10 files under the `referenceImages` field. The JSON enquiry
// payload is expected on a `data` text field (stringified).
module.exports = upload.fields([{ name: 'referenceImages', maxCount: 10 }]);
