const express = require('express');
const router = express.Router();
const controller = require('../controllers/metalPrices.controller');
const authenticateToken = require('../middleware/authenticateToken');

// GET all prices
router.get('/', authenticateToken, controller.getAllPrices);

// GET latest prices
router.get('/latest', authenticateToken, controller.getLatestPrices);

// POST new price entry
router.post('/', authenticateToken, controller.addPrice);

// PUT update price
router.put('/:metal', authenticateToken, controller.updatePrice);

// DELETE price entry
router.delete('/:metal', authenticateToken, controller.deletePrice);

module.exports = router;