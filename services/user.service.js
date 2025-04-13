const repo = require('../repositories/user.repo');

exports.getUsers = () => repo.getAllUsers();
