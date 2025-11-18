const express = require('express');
const router = express.Router();
const controller = require('../controllers/notifications.controller');
const authenticateToken = require('../middleware/authenticateToken');

// --- User-facing routes ---
// Get all notifications
router.get('/', authenticateToken, controller.getAll);

// Get unread count
router.get(
  '/unread-count',
  authenticateToken,
  controller.getUnreadCount
);

// Mark one as read
router.patch(
  '/:id/read',
  authenticateToken,
  controller.markOneRead
);

// Mark all as read
router.post(
  '/mark-all-read',
  authenticateToken,
  controller.markAllRead
);

module.exports = router;