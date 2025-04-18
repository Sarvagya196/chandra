const repo = require('../repositories/user.repo');

exports.getUsers = async () => {
    return await repo.find({}, {Id: 1, Name: 1, _id:0})
    // repo.getAllUsers();
}

exports.getUserById = async (id) => {
    return await repo.findOne({ Id: id });
};