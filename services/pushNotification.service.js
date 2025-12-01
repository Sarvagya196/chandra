const admin = require('firebase-admin');
const userService = require('../services/user.service');


/**
 * Send push notifications to a list of FCM tokens.
 * @param {Array<String>} tokens - List of FCM device tokens
 * @param {String} title - Notification title
 * @param {String} body - Notification body
 * @param {Object} [data={}] - Optional data payload
 * @param {String} [androidChannelId] - Optional Android notification channel ID (defaults to 'default')
 */
exports.sendPushToTokens = async (tokens, title, body, data = {}, androidChannelId = 'default') => {
  console.log(`[FCM] Sending push notification to ${tokens?.length || 0} token(s)`);
  console.log(`[FCM] Title: ${title}`);
  console.log(`[FCM] Body: ${body}`);
  console.log(`[FCM] Data:`, data);

  if (!tokens || tokens.length === 0) {
    console.log('[FCM] ⚠ No FCM tokens provided for push');
    return;
  }

  try {
    const batch = tokens.map(token => {
      // Convert data object values to strings (FCM requirement)
      const stringifiedData = {};
      Object.keys(data).forEach(key => {
        stringifiedData[key] = String(data[key] || '');
      });

      // Add fallback Title and Body in data payload
      stringifiedData.Title = String(title || '');
      stringifiedData.Body = String(body || '');

      const message = {
        token,
        notification: {
          title: String(title || ''),
          body: String(body || ''),
        },
        data: stringifiedData,
        android: {
          priority: 'high',
          notification: {
            channelId: androidChannelId || 'default',
            sound: 'default',
            priority: 'high',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK', // For React Native/Flutter compatibility
          },
        },
        apns: {
          headers: {
            'apns-priority': '10', // High priority for iOS
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      return message;
    });

    // Log first message payload for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[FCM] Sample payload:', JSON.stringify(batch[0], null, 2));
    }

    // Use FCM batch sending
    console.log(`[FCM] Calling FCM API to send ${batch.length} message(s)...`);
    const response = await admin.messaging().sendEach(batch);
    const successCount = response.successCount || 0;
    const failureCount = response.failureCount || 0;

    console.log(`[FCM] 📩 FCM API Response: ${successCount} success, ${failureCount} failed`);

    // Handle failures and remove invalid tokens
    if (failureCount > 0 && response.responses) {
      const invalidTokens = [];
      
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const token = tokens[idx];
          const error = resp.error;
          
          console.error(`[FCM] ❌ Failed token ${token.substring(0, 20)}...:`, {
            code: error?.code,
            message: error?.message,
          });

          // Remove invalid/expired tokens
          if (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-argument'
          ) {
            invalidTokens.push(token);
          }
        }
      });

      // Remove invalid tokens from database
      if (invalidTokens.length > 0) {
        console.log(`[FCM] 🗑 Removing ${invalidTokens.length} invalid token(s) from database`);
        try {
          await userService.removePushTokensFromUsers(invalidTokens);
          console.log(`[FCM] ✅ Removed ${invalidTokens.length} invalid token(s) from database`);
        } catch (cleanupError) {
          console.error(`[FCM] ❌ Error removing token:`, cleanupError);
        }
      }
    }

    return {
      successCount,
      failureCount,
      responses: response.responses,
    };


   
  } catch (error) {
    console.error('❌ Failed to send push notifications:', error);
  }
};