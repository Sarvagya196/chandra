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

/**
 * Fetch all messages for a specific ChatId, sorted by Timestamp ascending.
 * @param {ObjectId} chatId - The chat whose messages to fetch.
 */
exports.getMessagesByChatId = async (chatId) => {
  return await Message.find({ ChatId: chatId })
    .sort({ Timestamp: 1 })
    .lean();
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
 * Marks all messages in a chat as read by given users with timestamps.
 * @param {ObjectId} chatId
 * @param {Array<ObjectId>|ObjectId} userIds - Single user ID or array of user IDs
 */
exports.markMessagesAsRead = async (chatId, userIds) => {
  if (!Array.isArray(userIds)) userIds = [userIds];

  const readAt = new Date();

  // For each userId, update messages that don't already have this user in ReadBy
  // or update the readAt timestamp if they do
  const updatePromises = userIds.map(async (userId) => {
    // Add new read receipt for messages that don't have this user
    await Message.updateMany(
      { 
        ChatId: chatId,
        'ReadBy.userId': { $ne: userId }
      },
      {
        $push: {
          ReadBy: {
            userId: userId,
            readAt: readAt
          }
        }
      }
    );

    // Update readAt timestamp for messages where user already exists
    await Message.updateMany(
      {
        ChatId: chatId,
        'ReadBy.userId': userId
      },
      {
        $set: {
          'ReadBy.$[elem].readAt': readAt
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );
  });

  await Promise.all(updatePromises);
  return { acknowledged: true };
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
