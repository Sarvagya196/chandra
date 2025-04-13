const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    Id: String,
    Name: String,
    ClientId: { type: String, ref: 'Client' },
    StatusHistory: [{
        Status: String,
        Timestamp: Date,
        AssignedTo: {
            Id: String,
            Name: String,
            Email: String,
            Phone: String,
            Role: String
        }
    }],
    Priority: String,
    MetalType: String,
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
        ImageUrl: String,
        Description: String
    }],
    Coral: [{
        Id: String,
        Version: String,
        Images: [{
            Id: String,
            ImageUrl: String,
            Description: String
        }],
        Excel: [{
            Id: String,
            FileUrl: String,
            Description: String
        }],
        Pricing: {
            From: Number,
            To: Number,
            Exact: Number
        },
        IsApprovedVersion: Boolean
    }],
    Cad: [{
        Id: String,
        Version: String,
        CreatedDate: Date,
        Images: [{
            Id: String,
            ImageUrl: String,
            Description: String
        }],
        Excel: {
            Id: String,
            FileUrl: String,
            Description: String
        },
        Pricing: {
            From: Number,
            To: Number,
            Exact: Number
        },
        IsFinalVersion: Boolean
    }]
});

module.exports = mongoose.model('Enquiry', enquirySchema);
