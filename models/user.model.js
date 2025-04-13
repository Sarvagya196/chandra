const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    Id: String,
    Name: String,
    Email: String,
    Phone: String,
    Role: { type: String, enum: ['Admin', 'Designer', 'ClientManager'] } // update as needed
});

module.exports = mongoose.model('User', userSchema);
