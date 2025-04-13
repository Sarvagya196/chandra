const express = require('express');
const router = express.Router();
const controller = require('../controllers/client.controller');

// GET all clients
router.get('/', controller.getClients);

// POST a new client
router.post('/', controller.createClient);

// PUT update a client by ID
router.put('/:id', controller.updateClient);

module.exports = router;
