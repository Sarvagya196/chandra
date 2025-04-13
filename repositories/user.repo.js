const User = require('../models/user.model');

exports.getAllUsers = () => {
    return User.find();
};
