const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticateToken = require('../middleware/authenticateToken');
const controller = require('../controllers/designs.controller');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Only image files are accepted'));
    }
});

router.post('/insert', authenticateToken, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            const message = err instanceof multer.MulterError
                ? err.message
                : err.message || 'File upload error';
            return res.status(400).json({ error: message });
        }
        next();
    });
}, controller.insertDesign);

router.get('/:id', authenticateToken, controller.getById);

router.post('/lookup', authenticateToken, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            const message = err instanceof multer.MulterError
                ? err.message
                : err.message || 'File upload error';
            return res.status(400).json({ error: message });
        }
        next();
    });
}, controller.lookup);

module.exports = router;
