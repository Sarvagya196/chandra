const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  // 🔗 The chat this message belongs to
  ChatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chat', 
    required: true 
  },

  // 👤 Sender of the message
  SenderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
 
  // 💬 For replies / threads
  ParentMessageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message', 
    default: null 
  },

  // 📝 Text or caption
  Message: { 
    type: String, 
    trim: true 
  },

  // 🎞️ Message type
  MessageType: { 
    type: String, 
    enum: ['text', 'image', 'video', 'file'], 
    default: 'text' 
  },

  // 📎 Attachment info
  MediaKey: { type: String },
  MediaName: { type: String },
  MediaUrl: { type: String },
  MediaSize: { type: Number },

  // 👀 Read receipts
  ReadBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // ⏰ Timestamp
  Timestamp: { type: Date, default: Date.now }

}, { timestamps: true });

/* Indexes for fast pagination */
MessageSchema.index({ ChatId: 1, Timestamp: 1 });
MessageSchema.index({ SenderId: 1 });

module.exports = mongoose.model('Message', MessageSchema);