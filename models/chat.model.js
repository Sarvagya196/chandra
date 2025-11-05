const ChatSchema = new mongoose.Schema({
  enquiryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Enquiry', 
    required: true 
  },
  enquiryName: { type: String, required: true }, // cached for quick display

  type: { 
    type: String, 
    enum: ['admin-client', 'admin-designer'], 
    required: true 
  },

  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

  lastRead: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      lastReadAt: { type: Date, default: null }
    }
  ],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

ChatSchema.index({ enquiryId: 1, type: 1 }, { unique: true });
