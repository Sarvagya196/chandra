const repo = require('../repositories/chat.repo');
const Message = require('../models/message.model');
const messageService = require('../services/message.service');

/**
 * Creates a single chat if not already existing.
 *
 * @param {Object} data
 * @param {ObjectId} data.EnquiryId
 * @param {String} data.EnquiryName
 * @param {String} data.Type - 'admin-client' | 'admin-designer'
 * @param {Array<ObjectId>} data.Participants
 */
exports.createChat = async (EnquiryId, EnquiryName, Type, Participants) => {
  try {
    // Validate required fields
    if (!EnquiryId) {
      throw new Error('EnquiryId is required and cannot be null or undefined');
    }
    if (!Type) {
      throw new Error('Type is required and cannot be null or undefined');
    }
    if (!EnquiryName) {
      throw new Error('EnquiryName is required and cannot be null or undefined');
    }
    if (!Array.isArray(Participants)) {
      throw new Error('Participants must be an array');
    }

    // Check for existing chat
    const existingChat = await repo.findChatByEnquiryAndType(EnquiryId, Type);
    if (existingChat) {
      console.log(`Chat already exists for Enquiry ${EnquiryId} (${Type})`);
      return existingChat;
    }

    // Create chat document
    const chat = await repo.createChat({
      EnquiryId,
      EnquiryName,
      Type,
      Participants,
    });

    console.log(`Created chat for Enquiry ${EnquiryId} (${Type})`);
    return chat;
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000 || error.name === 'MongoServerError') {
      const errorMsg = error.message || '';
      if (errorMsg.includes('duplicate key') && errorMsg.includes('null')) {
        console.error(`❌ Duplicate key error with null values detected. This usually means there's an invalid chat document in the database.`);
        console.error(`   Please run: db.chats.deleteMany({ $or: [{ EnquiryId: null }, { Type: null }] })`);
        console.error(`   Or restart the server to auto-cleanup invalid chats.`);
        
        // Try to clean up and retry once
        try {
          const Chat = require('../models/chat.model');
          await Chat.cleanupInvalidChats();
          // Retry creating the chat
          const retryChat = await repo.createChat({
            EnquiryId,
            EnquiryName,
            Type,
            Participants,
          });
          console.log(`✅ Successfully created chat after cleanup for Enquiry ${EnquiryId} (${Type})`);
          return retryChat;
        } catch (retryError) {
          console.error(`❌ Retry failed after cleanup:`, retryError);
          throw new Error(`Failed to create chat after cleanup. Please manually clean up invalid chat documents in the database.`);
        }
      }
    }
    console.error(`Error creating chat for Enquiry ${EnquiryId} (${Type}):`, error);
    throw error;
  }
};

/**
 * Updates participants for an existing chat.
 *
 * @param {ObjectId} EnquiryId
 * @param {String} Type
 * @param {Array<ObjectId>} Participants
 */
exports.updateParticipants = async (EnquiryId, Type, Participants) => {
  try {
    const result = await repo.updateParticipants(EnquiryId, Type, Participants);
    console.log(`Updated participants for chat ${Type} (Enquiry ${EnquiryId})`);
    return result;
  } catch (error) {
    console.error(`Error updating participants for chat ${Type} (Enquiry ${EnquiryId}):`, error);
    throw error;
  }
};

/**
 * Adds a participant if not already present in the chat.
 *
 * @param {ObjectId} EnquiryId
 * @param {String} Type
 * @param {ObjectId} UserId
 */
exports.addParticipantIfMissing = async (EnquiryId, Type, UserId) => {
  try {
    await repo.addParticipantIfMissing(EnquiryId, Type, UserId);
    console.log(`Checked participant ${UserId} for chat (${Type}) Enquiry ${EnquiryId}`);
  } catch (err) {
    console.error(`Failed to add participant ${UserId} to chat (${Type}) for Enquiry ${EnquiryId}`, err);
  }
};

/**
 * Get paginated chats for a user (aggregation-based).
 *
 * @param {ObjectId} userId - Logged-in user
 * @param {Number} page - Page number (1-based)
 * @param {Number} limit - Items per page
 * @param {String} search - Optional search term
 */
exports.getChatsForUser = async (userId, page = 1, limit = 10, search = '') => {
  const { total, data } = await repo.getChatsForUserAgg(userId, page, limit, search);

  // Format chats for frontend
  const formatted = await Promise.all(
    data.map(async (chat) => {
      // Compute unread message count based on ReadBy array
      // Count messages where:
      // 1. SenderId !== currentUserId (messages not sent by current user)
      // 2. AND current user's ID is NOT in ReadBy array (message not read by current user)
      const unreadCount = await Message.countDocuments({
        ChatId: chat._id,
        SenderId: { $ne: userId },
        $or: [
          { ReadBy: { $exists: false } },           // ReadBy field doesn't exist
          { ReadBy: { $size: 0 } },                 // ReadBy array is empty
          { 'ReadBy.userId': { $nin: [userId] } }   // Current user not in ReadBy array (using $nin = not in)
        ]
      });

      // Prepare last message preview
      const lm = chat.LastMessage;
      const messageText = lm
        ? lm.MessageType === 'text'
          ? lm.Message
          : lm.MessageType === 'image'
          ? '📷 Photo'
          : lm.MessageType === 'video'
          ? '🎥 Video'
          : ''
        : '(no messages yet)';

        console.log("lm=========>", lm);

      return {
        _id: chat._id,
        EnquiryId: chat.EnquiryId,
        EnquiryName: chat.EnquiryName,
        Type: chat.Type,
        LastMessage: {
          Text: messageText,
          Timestamp: lm?.Timestamp || chat.UpdatedAt,
          Sender: lm?.Sender?.Name || null,
          SenderId: lm?.Sender?._id || null,
        },
        UnreadCount: unreadCount,
        UpdatedAt: chat.UpdatedAt,
      };
    })
  );

  return {
    Total: total,
    page,
    limit,
    TotalPages: Math.ceil(total / limit),
    Data: formatted,
  };
};

exports.getChatByChatId = async (chatId) => {
    return repo.getChatByChatId(chatId);
}

/**
 * Mark all messages in a chat as read and update last read timestamps.
 * Supports multiple users in a single operation.
 */
exports.markChatAsRead = async (chatId, userIds) => {
  try {
    if (!Array.isArray(userIds)) userIds = [userIds];
    // 2️⃣ Update last read timestamps (chat collection)

    await repo.updateLastRead(chatId, userIds);

    return { success: true, updatedUsers: userIds };
  } catch (err) {
    console.error(`❌ Failed to mark chat ${chatId} as read:`, err);
    throw err;
  }
};

exports.deleteChatsByEnquiryId = async (enquiryId) => {
  try {
    const chats = await repo.findChatsByEnquiryId(enquiryId);
    if (!chats || chats.length === 0) {
      console.log(`ℹ️ No chats found for Enquiry ${enquiryId}`);
      return { success: true, deletedChats: 0, deletedMessages: 0 };
    }

    const chatIds = chats.map(c => c._id);

    // 2️⃣ Delete all messages linked to these chatIds
    const messageResult = await messageService.deleteMessagesByChatIds(chatIds);

    // 3️⃣ Delete the chat documents themselves
    const chatResult = await repo.deleteChatsByEnquiryId(enquiryId);
    
    console.log(`🧹 Cleanup complete for Enquiry ${enquiryId}`);
    return {
      success: true,
      deletedChats: chatResult.deletedCount,
      deletedMessages: messageResult.deletedCount
    };
  } catch (error) {
    console.error(`❌ Error deleting messages for enquiry ${enquiryId}:`, error);
    throw error;
  }
};

exports.updateLastMessage = async (chatId, messageId) => {
  try {
    await repo.updateLastMessage(chatId, messageId);
  } catch (err) {
    console.error(`❌ Failed to update last message for chat ${chatId}:`, err);
  }
};