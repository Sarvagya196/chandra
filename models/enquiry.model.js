const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    Id: String,
    Name: String,
    Quantity: Number,
    StyleNumber: String,
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
        Url: String,
        Description: String
    }],
    Coral: [{
        Id: String,
        Version: String,
        Images: [{
            Id: String,
            Url: String,
            Description: String
        }],
        Excel: {
            Id: String,
            Url: String,
            Description: String
        },
        Pricing: {
            From: Number,
            To: Number,
            Exact: Number
        },
        IsApprovedVersion: Boolean
        // CreatedDate: Date
    }],
    Cad: [{
        Id: String,
        Version: String,
        // CreatedDate: Date,
        Images: [{
            Id: String,
            Url: String,
            Description: String
        }],
        Excel: {
            Id: String,
            Url: String,
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



// id , version, type , images, excel
// type -> ref image -> upload images
// type -> coral/cad -> version, images and excel
