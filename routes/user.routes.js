const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/', authenticateToken, userController.getUsers);
router.get('/:id', authenticateToken, userController.getUserById);
router.post('/registerPushToken', authenticateToken, userController.savePushToken);

module.exports = router;
