const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticateToken = require('../middleware/authenticateToken');
const controller = require('../controllers/imagePricing.controller');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Only image files are accepted'));
    }
});

router.post('/', authenticateToken, upload.single('image'), controller.extractAndPrice);

module.exports = router;
