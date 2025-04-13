const service = require('../services/user.service');

exports.getUsers = async (req, res) => {
    const users = await service.getUsers();
    res.json(users);
};
