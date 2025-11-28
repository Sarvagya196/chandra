// Use CommonJS to import the repository
const repo = require('../repositories/notifications.repo');
const pushService = require('../services/pushNotification.service');
const userService = require('../services/user.service');
const notificationChannels = require('../utils/notificationChannels');

/**
 * Get all notifications for a specific user.
 * (Uses repo.find)
 */
exports.getUserNotifications = async (userId) => {
  const query = { User: userId };
  // Using default sort and limit from repo
  return repo.find(query);
};

/**
 * Get the unread notification count for a user.
 * (Uses repo.count)
 */
exports.getUnreadCount = async (userId) => {
  const query = { User: userId, Read: false };
  return repo.count(query);
};

/**
 * Mark a single notification as read.
 * (Uses repo.findOneAndUpdate)
 */
exports.markAsRead = async (notificationId, userId) => {
  const query = {
    _id: notificationId,
    User: userId,
  };
  const update = { Read: true };

  const notification = await repo.findOneAndUpdate(
    query,
    update
  );

  if (!notification) {
    throw new Error('Notification not found or user unauthorized');
  }
  return notification;
};

/**
 * Mark all of a user's notifications as read.
 * (Uses repo.updateMany)
 */
exports.markAllAsRead = async (userId) => {
  const query = { User: userId, Read: false };
  const update = { Read: true };
  return repo.updateMany(query, update);
};


/**
 * Creates an alert notification for multiple users at once.
 * Saves to DB for each user, then sends one batch push.
 *
 * @param {Array<string>} userIds - An array of user IDs to notify
 * @param {string} title - The notification title
 * @param {string} body - The notification body
 * @param {string} type - The notification type
 * @param {string} [link] - Optional in-app link
 */
exports.createAlertsForUsers = async (userIds, title, body, type, link) => {
  // 1. Prepare notification documents for all users
  const notificationsToCreate = userIds.map(userId => ({
    User: userId,
    Title: title,
    Body: body,
    Type: type,
    link: link || '',
    Read: false
  }));

  // 2. --- SAVE FIRST ---
  // Save all notifications to the 'Notifications' collection in one go
  const createdNotifications = await repo.insertMany(
    notificationsToCreate
  );

  // 3. --- THEN SEND PUSH ---
  try {
    // Get all tokens for all users (using your existing service)
    const allTokens = userService.getTokensByIds(userIds);

    if (allTokens && allTokens.length > 0) {
      
      // The push data is now generic for this batch
      const pushData = {
        type: type,
        link: link || '',
      };

      const androidChannelId = notificationChannels.getChannelIdByType(type);
      console.log("[NOTIFICATION] Using Android channel: ${androidChannelId} for type: ${type}");

      // Call your push service once with the combined token list
      await pushService.sendPushToTokens(
        allTokens,
        title,
        body,
        pushData,
        androidChannelId
      );

    } else {
      console.log(`⚠️ No FCM tokens found for users, push not sent.`);
    }
  } catch (error) {
    console.error(`❌ Failed to send push for bulk alerts`, error);
  }

  return createdNotifications;
};