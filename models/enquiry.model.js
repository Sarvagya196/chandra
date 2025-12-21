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
    Color: String,
    Quality: String,
    Rate: Number
  }, { _id: false });

  const PricingSchema = new mongoose.Schema({
    MetalPrice: { type: Number, default: 0 },
    DiamondsPrice: { type: Number, default: 0 },
    TotalPrice: { type: Number, default: 0 },
    DutiesAmount: { type: Number, default: 0 },
    Loss: { type: Number, default: 0 },
    Labour: { type: Number, default: 0 },
    ExtraCharges: { type: Number, default: 0 },
    Duties: { type: Number, default: 0 },
    DiamondWeight: Number,
    TotalPieces: Number,
    ClientPricingMessage: { type: String, default: null },
    UndercutPrice: { type: Number, default: 0 },
    Stones: {
      type: [StoneSchema]
    },
    Metal: MetalSchema,
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
        Color: String,
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
    ReferenceVideos: [{
        Id: String,
        Key: String,
        Description: String
    }],
    Coral: [{
        Version: String,
        CoralCode: String,
        Images: [{
            Id: String,
            Key: String,
            Description: String
        }],
        Videos: [{
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
            type: [PricingSchema]
        },
        ShowToClient: Boolean,
        IsApprovedVersion: Boolean,
        ReasonForRejection: String,
        CreatedDate: { type: Date, default: Date.now }
    }],
    Cad: [{
        Version: String,
        CadCode: String,
        Images: [{
            Id: String,
            Key: String,
            Description: String
        }],
        Videos: [{
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
            type: [PricingSchema]
        },
        ShowToClient: Boolean,
        IsFinalVersion: Boolean,
        ReasonForRejection: String,
        CreatedDate: { type: Date, default: Date.now }
    }]
});

enquirySchema.index({ "Cad.CadCode": 1 });
enquirySchema.index({ "Coral.CoralCode": 1 });

// Also index your other top-level search fields
enquirySchema.index({ Name: 1 });
enquirySchema.index({ StyleNumber: 1 });
enquirySchema.index({ GatiOrderNumber: 1 });

module.exports = mongoose.model('Enquiry', enquirySchema);
