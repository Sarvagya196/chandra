const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  // 🔗 The chat this message belongs to
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chat', 
    required: true 
  },

  // 👤 Sender of the message
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  // 💬 For replies / threads
  parentMessageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message', 
    default: null 
  },

  // 📝 Text or caption
  message: { 
    type: String, 
    trim: true 
  },

  // 🎞️ Message type
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'video', 'file'], 
    default: 'text' 
  },

  // 📎 Attachment info
  mediaKey: { type: String },
  mediaName: { type: String },
  mediaUrl: { type: String },
  mediaSize: { type: Number },

  // 👀 Read receipts
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // ⏰ Timestamp
  timestamp: { type: Date, default: Date.now }

}, { timestamps: true });

/* Indexes for fast pagination */
MessageSchema.index({ chatId: 1, timestamp: 1 });
MessageSchema.index({ senderId: 1 });

module.exports = mongoose.model('Message', MessageSchema);