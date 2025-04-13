const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    id: String,
    name: String,
    Pricing: {
        From: Number,
        To: Number,
        Exact: Number
    }
});

module.exports = mongoose.model('Client', clientSchema);
