const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {type: String, required: true},
    email: {type: String, unique: true},
    phone: {type: String, unique: true},
    role: {type: Number, required: true},
    password: {type: String, required: true},
    clientId: { type: String, ref: 'Client' },
});

module.exports = mongoose.model('User', userSchema);
