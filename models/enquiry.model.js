const mongoose = require('mongoose');

  const StoneSchema = new mongoose.Schema({
    Type: String,
    Color: String,
    Shape: String,
    MmSize: String,
    SieveSize: String,
    Weight: Number,
    Pcs: Number,
    CtWeight: Number,
    Price: Number,
  }, { _id: false });

  const MetalSchema = new mongoose.Schema({
    Weight: Number,
    Type: String,
    Quality: String,
  }, { _id: false });

  const PricingSchema = new mongoose.Schema({
    MetalPrice: { type: Number, default: 0 },
    DiamondsPrice: { type: Number, default: 0 },
    TotalPrice: { type: Number, default: 0 },
    Loss: { type: Number, default: 0 },
    Labour: { type: Number, default: 0 },
    ExtraCharges: { type: Number, default: 0 },
    Duties: { type: Number, default: 0 },
    DiamondWeight: Number,
    TotalPieces: Number,
    Stones: {
      type: [StoneSchema]
    },
    Metal: MetalSchema,
    Message: String,
  }, { _id: false });

const enquirySchema = new mongoose.Schema({
    Name: String,
    Quantity: Number,
    StyleNumber: String,
    GatiOrderNumber: String,
    ClientId: { type: String, ref: 'Client' },
    StatusHistory: [{
        Status: String,
        Timestamp: Date,
        AssignedTo: String,
        Details: String,
        AddedBy: String
    }],
    Priority: String,
    Metal: {
        Type: String,
        Quality: String
    },
    Category: String,
    StoneType: String,
    MetalWeight: {
        From: Number,
        To: Number,
        Exact: Number
    },
    DiamondWeight: {
        From: Number,
        To: Number,
        Exact: Number
    },
    Stamping: String,
    Remarks: String,
    ShippingDate: Date,
    ReferenceImages: [{
        Id: String,
        Key: String,
        Description: String
    }],
    Coral: [{
        Version: String,
        Images: [{
            Id: String,
            Key: String,
            Description: String
        }],
        Excel: {
            Id: String,
            Key: String,
            Description: String
        },
        Pricing: {
            type: PricingSchema
        },
        IsApprovedVersion: Boolean,
        CreatedDate: Date
    }],
    Cad: [{
        Version: String,
        CreatedDate: Date,
        Images: [{
            Id: String,
            Key: String,
            Description: String
        }],
        Excel: {
            Id: String,
            Key: String,
            Description: String
        },
        Pricing: {
            type: PricingSchema
        },
        IsFinalVersion: Boolean
    }]
});

module.exports = mongoose.model('Enquiry', enquirySchema);
