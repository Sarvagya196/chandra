
/**
 * Android Notification Channel IDs
 * 
 * These channel IDs must match the channels created in your mobile app.
 * Android 8.0+ requires notification channels for all notifications.
 * 
 * Create these channels in your mobile app (React Native/Flutter):
 * 
 * React Native (using @react-native-firebase/messaging):
 * javascript
 * import messaging from '@react-native-firebase/messaging';
 * 
 * // Create default channel
 * messaging().setBackgroundMessageHandler(async remoteMessage => {
 *   // Channel should be created in native Android code
 * });
 * 
 * 
 */

module.exports = {
  // Default channel for general notifications
  DEFAULT: 'default_channel',
  
  // Channel for enquiry-related notifications
  ENQUIRY: 'enquiry_channel',
  
  // Channel for chat/message notifications
  MESSAGE: 'message_channel',
  
  // Channel for system alerts
  SYSTEM: 'system_channel',
  
  // Channel for high priority notifications
  HIGH_PRIORITY: 'high_priority_channel',
  
  /**
   * Get channel ID based on notification type
   * @param {string} notificationType - The type of notification
   * @returns {string} Channel ID
   */
  getChannelIdByType: (notificationType) => {
    const channelMap = {
      'enquiry_created': 'enquiry_channel',
      'enquiry_assigned': 'enquiry_channel',
      'enquiry_updated': 'enquiry_channel',
      'new_message': 'message_channel',
      'asset_upload': 'enquiry_channel',
      'system_alert': 'system_channel',
      'other': 'default_channel',
    };
    
    return channelMap[notificationType] || 'default_channel';
  }
};