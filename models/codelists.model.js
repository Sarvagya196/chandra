const mongoose = require('mongoose');

// --- 1. Schema for the individual code item (the structure of each value in the array) ---
const CodeValueSchema = new mongoose.Schema({
    // Corresponds to your "Id" field
    Id: {
        type: mongoose.Schema.Types.Mixed, // Use Mixed to allow either String or Number
        required: true
    },
    // Corresponds to your "Code" field (e.g., "US", "PENDING")
    Code: {
        type: String,
        required: true
    },
    // Corresponds to your "Name" field (e.g., "United States", "Order Pending")
    Name: {
        type: String,
        required: true
    }
}, { _id: false }); // We don't need an individual _id for items inside the array

// --- 2. Schema for the main Codelist document ---
const CodelistSchema = new mongoose.Schema({
    // The key field used for lookup (e.g., "Country", "OrderStatus")
    Type: {
        type: String,
        required: true,
        unique: true, // Ensures only one document exists for each list type
        trim: true
    },
    // The array containing all the code items
    Values: {
        type: [CodeValueSchema], // Embeds the CodeValueSchema defined above
        default: []
    }
});

// --- 3. Index for fast lookup ---
// This index will make your findOne({ Type: "..." }) queries extremely fast.
CodelistSchema.index({ Type: 1 });

module.exports = mongoose.model('Codelist', CodelistSchema);