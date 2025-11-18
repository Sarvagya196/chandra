const repo = require('../repositories/metalPrices.repo');

exports.getAll = () => repo.getAllPrices();
exports.getLatest = () => repo.getLatestPrices();

exports.add = (metal, entry) => {
  if (!['gold', 'silver', 'platinum'].includes(metal)) {
    throw new Error('Invalid metal type');
  }
  return repo.addPrice(metal, entry);
};

exports.update = (metal, date, price) => {
  if (!['gold', 'silver', 'platinum'].includes(metal)) {
    throw new Error('Invalid metal type');
  }
  return repo.updatePrice(metal, date, price);
};

exports.remove = (metal, date) => {
  if (!['gold', 'silver', 'platinum'].includes(metal)) {
    throw new Error('Invalid metal type');
  }
  return repo.deletePrice(metal, date);
};