const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  enquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  message: String,
  messageType: { type: String, enum: ['text','video','image','file'], default: 'text' },
  mediaKey: String,
  mediaName: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);