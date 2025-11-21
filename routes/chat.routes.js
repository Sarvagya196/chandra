const express = require('express');
const router = express.Router();
const controller = require('../controllers/chat.controller');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/', authenticateToken, controller.getUserChats);
router.get('/enquiry/:enquiryId', authenticateToken, controller.getChatsByEnquiryId);

module.exports = router;
