const Message = require('../models/message.model');

/**
 * Creates a new message.
 * @param {Object} message - The message document to insert.
 */
exports.createMessage = async (message) => {
  try {
    return await Message.create(message);
  } catch (error) {
    throw new Error('Error creating message: ' + error.message);
  }
};

exports.getMessageById = async (messageId) => {
    try {
        return await Message.findById(messageId).lean();
    } catch (error) {
        throw new Error('Error retrieving message with ID ' + messageId + ': ' + error.message);
    }
};

exports.editMessage = async (messageId, userId, newMessage) => {
    return Message.findOneAndUpdate(
        {
            _id: messageId,
            SenderId: userId,
            IsDeleted: { $ne: true }
        },
        {
            $set: {
                Message: newMessage,
                IsEdited: true,
            }
        },
        { new: true }
    );
};

exports.softDeleteMessage = async (messageId, userId) => {
    return Message.findOneAndUpdate(
        {
            _id: messageId,
            SenderId: userId,
            IsDeleted: { $ne: true }
        },
        {
            $set: {
                IsDeleted: true,
                Message: '',
                MediaUrl: null,
                MediaKey: null,
                MediaName: null,
                MediaSize: null
            }
        },
        { new: true }
    );
};


/**
 * Deletes a message by its ID.
 * @param {ObjectId} messageId - The ID of the message to delete.
 */
exports.deleteMessageById = async (messageId) => {
    try {
        const result = await Message.deleteOne({ _id: messageId });
        return result;
    } catch (error) {
        throw new Error('Error deleting message with ID ' + messageId + ': ' + error.message);
    }
};

/**
 * Fetch paginated messages for a chat before a given timestamp.
 * Populates ParentMessageId so reply info is available.
 */
exports.getMessagesBefore = async (chatId, before, limit = 20) => {
  try {
    const query = { ChatId: chatId };
    if (before) query.Timestamp = { $lt: before };

    return await Message.find(query)
      .sort({ Timestamp: -1 }) // newest first for efficient cursor pagination
      .limit(limit)
      .populate({
        path: 'ParentMessageId',
        select: 'Message SenderId', // only fields needed for reply bubble
      })
      .lean();
  } catch (error) {
    throw new Error('Error fetching paginated messages: ' + error.message);
  }
};


/**
 * Deletes all messages in a specific chat.
 * @param {ObjectId} chatId - The chat whose messages to delete.
 */
exports.deleteMessagesByChatId = async (chatId) => {
  try {
    const result = await Message.deleteMany({ ChatId: chatId });
    return result;
  } catch (error) {
    throw new Error('Error deleting messages for ChatId ' + chatId + ': ' + error.message);
  }
};

exports.deleteMessagesByChatIds = async (chatIds) => {
  try {
    const result = await Message.deleteMany({ ChatId: { $in: chatIds } });
    return result;
  } catch (err) {
    console.error(`❌ Error deleting messages for Chats ${chatIds}:`, err);
    throw err;
  }
};
