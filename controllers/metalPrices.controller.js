const service = require('../services/metalPrices.service');

// GET all
exports.getAllPrices = async (req, res) => {
  try {
    const data = await service.getAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET latest
exports.getLatestPrices = async (req, res) => {
  try {
    const data = await service.getLatest();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST - Add price
exports.addPrice = async (req, res) => {
  try {
    const { metal, price, date } = req.body;
    const newData = await service.add(metal, { price, date: new Date(date) });
    res.json(newData);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT - Update price
exports.updatePrice = async (req, res) => {
  try {
    const { metal } = req.params;
    const { date, price } = req.body;
    const updated = await service.update(metal, date, price);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE - Delete price
exports.deletePrice = async (req, res) => {
  try {
    const { metal } = req.params;
    const { date } = req.body;
    const updated = await service.remove(metal, date);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
