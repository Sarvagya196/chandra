const chatService = require('../services/chat.service')

exports.getUserChats = async (req, res) => {
  try {
    const userId = req.user._id; // assume auth middleware sets req.user
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const result = await chatService.getChatsForUser(userId, page, limit, search);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch chats',
    });
  }
};

exports.getChatsByEnquiryId = async (req, res) => {
  try {
    const { enquiryId } = req.params;
    const user = req.user;
    console.log("Enquiry ID:", req.user);
    if (!enquiryId) {
      return res.status(400).json({ message: 'enquiryId is required' });
    }

    const chats = await chatService.getChatsByEnquiryId(enquiryId,user);
    console.log("chats fetched",chats);
    res.status(200).json(chats);
  } catch (error) {
    console.error(`Error fetching chats for enquiry ${req.params.enquiryId}:`, error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch chats for enquiry',
    });
  }
};