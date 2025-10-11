const mongoose = require('mongoose');

const DiamondSchema = new mongoose.Schema({
    Type: { type: String },
    Shape: { type: String },
    Carat: {type: Number},
    MmSize: { type: String },
    SieveSize: { type: String},
    Price: { type: Number }
  }, { _id: false });
  
  const PricingSchema = new mongoose.Schema({
    Loss: { type: Number },
    Labour: { type: Number },
    ExtraCharges: { type: Number },
    Duties: { type: Number },
    Diamonds: [DiamondSchema]
  }, { _id: false });
  
  const ClientSchema = new mongoose.Schema({
    Name: { type: String, required: true },
    Pricing: PricingSchema
  });
  
  module.exports = mongoose.model('Client', ClientSchema);
