const mongoose = require('mongoose');

const priceEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  price: { type: Number, required: true }
}, { _id: false });

const metalPricesSchema = new mongoose.Schema({
  gold: [priceEntrySchema],
  silver: [priceEntrySchema],
  platinum: [priceEntrySchema],
}, { timestamps: true });

module.exports = mongoose.model('MetalPrices', metalPricesSchema);