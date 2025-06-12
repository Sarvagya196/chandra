const MetalPrices = require('../models/metalPrices.model');

exports.getAllPrices = async () => {
  return await MetalPrices.findOne();
};

exports.getLatestPrices = async () => {
  const data = await MetalPrices.findOne();
  if (!data) return null;

  const getLast = (arr) => arr?.length ? arr[arr.length - 1] : null;

  return {
    gold: getLast(data.gold),
    silver: getLast(data.silver),
    platinum: getLast(data.platinum)
  };
};

// POST - Add entry
exports.addPrice = async (metal, priceEntry) => {
  const update = { $push: { [metal]: priceEntry } };
  return await MetalPrices.findOneAndUpdate({}, update, { new: true, upsert: true });
};

// PUT - Update entry by date
exports.updatePrice = async (metal, date, newPrice) => {
  return await MetalPrices.findOneAndUpdate(
    { [`${metal}.date`]: new Date(date) },
    { $set: { [`${metal}.$.price`]: newPrice } },
    { new: true }
  );
};

// DELETE - Remove entry by date
exports.deletePrice = async (metal, date) => {
  return await MetalPrices.findOneAndUpdate(
    {},
    { $pull: { [metal]: { date: new Date(date) } } },
    { new: true }
  );
};
