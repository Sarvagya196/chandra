const express = require('express');
const router = express.Router();
const controller = require('../controllers/client.controller');
const authenticateToken = require('../middleware/authenticateToken');

// GET all clients
router.get('/', authenticateToken, controller.getClients);

// GET client by id
router.get('/:id', authenticateToken, controller.getClient);

// POST a new client
router.post('/', authenticateToken, controller.createClient);

// PUT update a client by ID
router.put('/:id', authenticateToken, controller.updateClient);

module.exports = router;
