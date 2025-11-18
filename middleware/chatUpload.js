const multer = require('multer');

const storage = multer.memoryStorage();
const chatUpload = multer({ storage }).single('file');

module.exports = chatUpload;