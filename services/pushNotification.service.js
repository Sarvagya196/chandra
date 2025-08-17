// pushNotificationService.js
const webpush = require('web-push');

// In-memory storage (use DB in production)
const subscriptions = {}; 

function initPushService(publicVapidKey, privateVapidKey, email) {
  webpush.setVapidDetails(`mailto:${email}`, publicVapidKey, privateVapidKey);
}

function saveSubscription(userId, subscription) {
  subscriptions[userId] = subscription;
}

function sendPush(userId, payload) {
  const subscription = subscriptions[userId];
  if (!subscription) return;

  return webpush.sendNotification(subscription, JSON.stringify(payload))
    .catch(err => console.error('Push error:', err));
}

function getSubscription(userId) {
  return subscriptions[userId];
}

module.exports = {
  initPushService,
  saveSubscription,
  sendPush,
  getSubscription
};
