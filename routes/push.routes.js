const express = require('express');
const router = express.Router();
const controller = require('../controllers/push.controller');

// Subscribe a user to push notifications
router.post('/subscribe/:userId', controller.subscribeUser);

// Send a push notification to a user
router.post('/send/:userId', controller.sendPushNotification);

// Unsubscribe a user from push notifications
// router.post('/unsubscribe/:userId', controller.unsubscribeUser);

module.exports = router;