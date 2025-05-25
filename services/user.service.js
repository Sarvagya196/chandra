const repo = require('../repositories/user.repo');

// Get all users
exports.getUsers = async () => {
    return await repo.getAllUsers();
};

// Get a user by ID
exports.getUserById = async (id) => {
    return await repo.getUser(id); // Corrected to use the repo method you defined
};
