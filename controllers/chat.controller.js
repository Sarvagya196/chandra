const chatService = require('../services/chat.service');

exports.saveMessage = async ({ enquiryId, senderId, message, messageType, mediaKey, mediaName }) => {
  try {
    const savedMessage = await chatService.createMessage({
      enquiryId,
      senderId,
      message,
      messageType,
      mediaKey,
      mediaName
    });
    return savedMessage;
  } catch (error) {
    console.error('❌ Error saving chat message:', error);
    throw new Error('Failed to save chat message.');
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await chatService.getMessages(req.params.enquiryId);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching enquiries:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

exports.uploadMedia = async (req, res) => {
    const file = req.file;
    try {
      const result = await chatService.uploadMedia(file);
      res.status(200).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
}