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
