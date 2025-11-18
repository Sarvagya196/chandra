const admin = require('firebase-admin');


/**
 * Send push notifications to a list of FCM tokens.
 * @param {Array<String>} tokens - List of FCM device tokens
 * @param {String} title - Notification title
 * @param {String} body - Notification body
 * @param {Object} [data={}] - Optional data payload
 */
exports.sendPushToTokens = async (tokens, title, body, data = {}) => {
  // Validate tokens array
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    console.log('⚠️ No FCM tokens provided for push');
    return;
  }

  // Filter out any null/undefined/empty tokens and ensure we always have an array
  const validTokens = tokens.filter(token => token && typeof token === 'string' && token.trim().length > 0);
  
  if (validTokens.length === 0) {
    console.log('⚠️ No valid FCM tokens found after filtering');
    return;
  }

  try {
    // Convert all data values to strings (Firebase requirement)
    const stringData = {};
    for (const [key, value] of Object.entries(data)) {
      stringData[key] = value !== null && value !== undefined ? String(value) : '';
    }

    // Build base message
    const message = {
      notification: { title, body },
      data: stringData,
    };

    // 🚀 Create batch array - always returns an array, never false
    const batch = validTokens.map(token => ({
      token: token.trim(),
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
