const express = require('express');
const router = express.Router();
const controller = require('../controllers/chat.controller');
const authenticateToken = require('../middleware/authenticateToken');
const chatUpload = require('../middleware/chatUpload');

// GET messages by enquiryId
router.get('/:enquiryId', authenticateToken, controller.getMessages);

//upload media
router.post('/upload', 
    authenticateToken, 
    chatUpload,
    controller.uploadMedia);

module.exports = router;
