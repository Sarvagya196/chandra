const chatService = require('../services/chat.service')

exports.getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const assignedTo = req.query.assignedTo || null;

    const result = await chatService.getChatsForUser(userId, page, limit, search, assignedTo);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch chats',
    });
  }
};

exports.getAssigneeList = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await chatService.getAssigneeList(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching assignee list:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch assignee list',
    });
  }
};