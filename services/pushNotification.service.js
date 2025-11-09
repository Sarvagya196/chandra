const admin = require('firebase-admin');


/**
 * Send push notifications to a list of FCM tokens.
 * @param {Array<String>} tokens - List of FCM device tokens
 * @param {String} title - Notification title
 * @param {String} body - Notification body
 * @param {Object} [data={}] - Optional data payload
 */
exports.sendPushToTokens = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) {
    console.log('⚠️ No FCM tokens provided for push');
    return;
  }

  try {
    // Build base message
    const message = {
      notification: { title, body },
      data,
    };

    // 🚀 Batch send (instead of individual sends)
    const batch = tokens.map(token => ({
      token,
      notification: message.notification,
      data: message.data,
    }));

    // Use FCM batch sending
    const response = await admin.messaging().sendEach(batch);
    const successCount = response.successCount || 0;
    const failureCount = response.failureCount || 0;

    console.log(`📩 Sent push: ${successCount} success, ${failureCount} failed`);
  } catch (error) {
    console.error('❌ Failed to send push notifications:', error);
  }
};
