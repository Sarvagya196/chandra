const mongoose = require('mongoose');
const ChatSchema = new mongoose.Schema({
  EnquiryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Enquiry', 
    required: true 
  },
  EnquiryName: { type: String, required: true }, // cached for quick display

  Type: { 
    type: String, 
    enum: ['admin-client', 'admin-designer'], 
    required: true 
  },

  Participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  LastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

  LastRead: [
    {
      UserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      LastReadAt: { type: Date, default: null }
    }
  ],

  CreatedAt: { type: Date, default: Date.now },
  UpdatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Create unique index with exact field names matching the schema
// The name parameter ensures the index name matches the schema field names
ChatSchema.index({ EnquiryId: 1, Type: 1 }, { unique: true, name: 'EnquiryId_1_Type_1' });

const Chat = mongoose.model('Chat', ChatSchema);


module.exports = Chat;
