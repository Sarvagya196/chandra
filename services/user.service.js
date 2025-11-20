const repo = require('../repositories/user.repo');

// Get all users
exports.getUsers = async () => {
    return await repo.getAllUsers();
};

// Get a user by ID
exports.getUserById = async (id) => {
    return await repo.getUser(id);
};

exports.getUsersByRole = async (roleId) => {
    return await repo.getUsersByRole(roleId);
}

exports.getUsersByClient = async (clientId) => {
    return await repo.getUsersByClient(clientId);
}

exports.savePushToken = async (userId, token) => {
  return await repo.savePushToken(userId, token);
};

exports.getTokensByIds = async (userIds) => await repo.getTokensByIds(userIds);
