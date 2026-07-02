const mongoose = require("mongoose");

const StoneSchema = new mongoose.Schema(
  {
    Type: String,
    Color: String,
    Shape: String,
    MmSize: String,
    SieveSize: String,
    Weight: Number,
    Pcs: Number,
    CtWeight: Number,
    Price: Number,
    Markup: Number,
  },
  { _id: false },
);

const MetalSchema = new mongoose.Schema(
  {
    Weight: Number,
    Color: String,
    Quality: String,
    Rate: Number,
  },
  { _id: false },
);

const DesignSchema = new mongoose.Schema({
  Name: String,
  UploadedBy: String, 
  DesignType: {
    type: String,
    enum: ["coral", "Cad"],
    required: true,
  },
  Metal: [MetalSchema],
  stones: [StoneSchema],
  Images: [{
  Id: String,
  Key: String,
  Description: String,
  Tags: [String],
  Category: String,
  Group: String,
  Vector: [Number],
  }],
  CreatedAt: { type: Date, default: Date.now },
  enquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: false, default: null },
});

module.exports = mongoose.model("Design", DesignSchema);
