const express = require('express');
const router = express.Router();
const controller = require('../controllers/push.controller');

// Subscribe a user to push notifications
router.post('/subscribe/:userId', controller.subscribeUser);


module.exports = router;