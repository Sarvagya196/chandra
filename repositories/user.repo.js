const User = require('../models/user.model');

// Get all users
exports.getAllUsers = async () => {
    return await User.find();
};

// Get a single user by MongoDB _id
exports.getUser = async (id) => {
    return await User.findById(id); // Correct usage: pass `id` directly
};
