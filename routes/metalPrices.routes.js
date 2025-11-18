const express = require('express');
const router = express.Router();
const controller = require('../controllers/metalPrices.controller');

// GET all prices
router.get('/', controller.getAllPrices);

// GET latest prices
router.get('/latest', controller.getLatestPrices);

// POST new price entry
router.post('/', controller.addPrice);

// PUT update price
router.put('/:metal', controller.updatePrice);

// DELETE price entry
router.delete('/:metal', controller.deletePrice);

module.exports = router;