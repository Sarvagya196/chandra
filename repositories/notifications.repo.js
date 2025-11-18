const Notification = require('../models/notifications.model');

/**
 * Find notifications matching a query.
 */
exports.find = async (query, sortOptions = { createdAt: -1 }, limit = 50) => {
  return Notification.find(query).sort(sortOptions).limit(limit).lean();
};

/**
 * Count documents matching a query.
 */
exports.count = async (query) => {
  return Notification.countDocuments(query);
};

/**
 * Find and update a single notification.
 */
exports.findOneAndUpdate = async (query, update) => {
  return Notification.findOneAndUpdate(query, update, { new: true }).lean();
};

/**
 * Update many notifications matching a query.
 */
exports.updateMany = async (query, update) => {
  return Notification.updateMany(query, update);
};

/**
 * Create a new notification.
 */
exports.create = async (notificationData) => {
  return Notification.create(notificationData);
};

/**
 * Create multiple notifications in one call.
 * @param {Array<Object>} notificationDataArray - An array of notification objects to create
 */
exports.insertMany = async (notificationDataArray) => {
  return Notification.insertMany(notificationDataArray);
};