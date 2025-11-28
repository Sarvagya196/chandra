const User = require('../models/user.model');

// Get all users
exports.getAllUsers = async () => {
    return await User.find();
};

// Get a single user by MongoDB _id
exports.getUser = async (id) => {
    return await User.findById(id); // Correct usage: pass `id` directly
};

exports.getUsersByRole = async (roleId) => {
  const users = await User.find({ role: roleId }).select('_id');
  return users.map(u => u._id);
};

exports.getUsersByClient = async (clientId) => {
  const users = await User.find({ clientId: clientId }).select('_id');
  return users.map(u => u._id);
};

exports.savePushToken = async (userId, token) => {
  return User.updateOne(
    { _id: userId },
    { $addToSet: { pushTokens: token } } // store multiple devices per user
  );
};

/**
 * Fetch only FCM tokens for given user IDs.
 * @param {Array<ObjectId>} userIds
 * @returns {Array<String>} all valid push tokens
 */
exports.getTokensByIds = async (userIds) => {
  if (!userIds?.length) return [];

  const users = await User.find(
    { _id: { $in: userIds }, pushTokens: { $exists: true, $ne: [] } },
    { pushTokens: 1 }
  ).lean();

  return users.flatMap((u) => u.pushTokens || []);
};

exports.removePushTokensFromUsers = async (tokens) => {
  return User.updateMany(
    { pushTokens: { $in: tokens } },
    { $pull: { pushTokens: { $in: tokens } } }
  );
}