const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticateToken = require('../middleware/authenticateToken');
const controller = require('../controllers/jewelryEstimate.controller');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Only image files are accepted'));
    }
});

const fields = upload.fields([
    { name: 'topView', maxCount: 1 },
    { name: 'sideView', maxCount: 1 },
    { name: 'fortyFiveView', maxCount: 1 },
    { name: 'additional', maxCount: 5 },
]);

router.post('/', authenticateToken, fields, controller.estimateAndPrice);

module.exports = router;
