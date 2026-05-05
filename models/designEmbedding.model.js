const mongoose = require('mongoose');

const designEmbeddingSchema = new mongoose.Schema({
    EnquiryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    Type:        { type: String, enum: ['reference', 'coral', 'cad'], required: true },
    Version:     { type: String },
    Key:         { type: String, required: true },
    Description: { type: String },
    Tags:        [{ type: String }],
    Embedding:   { type: [Number], required: true },
    CreatedAt:   { type: Date, default: Date.now },
});

designEmbeddingSchema.index({ EnquiryId: 1 });
designEmbeddingSchema.index({ Type: 1 });

module.exports = mongoose.model('DesignEmbedding', designEmbeddingSchema);
