const messageService = require('../services/message.service');

exports.uploadMedia = async (req, res) => {
    const file = req.file;
    try {
      const result = await messageService.uploadMedia(file);
      res.status(200).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
}


/**
 * GET /api/message/:chatId/messages
 */
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const before = req.query.before || null;
    const limit = parseInt(req.query.limit) || 20;

    const result = await messageService.getMessagesForChat(chatId, userId, before, limit);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch chat messages'
    });
  }
};

/**
 * POST /api/message/:chatId/markRead
 */
exports.markChatAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    await messageService.markChatAsRead(chatId, userId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking chat as read:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to mark chat as read'
    });
  }
};
