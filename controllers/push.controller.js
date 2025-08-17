const pushService = require('../services/pushNotification.service');

exports.subscribeUser = async (req, res) => {
  const { userId } = req.params;
  const subscription = req.body;

  pushService.saveSubscription(userId, subscription);

  console.log(`Saved subscription for user ${userId}`);
  res.status(201).json({ message: 'Subscription saved' });
};

exports.sendPushNotification = async (req, res) => {
    const { userId } = req.params;
    const payload = req.body; // e.g. { title: "New message", body: "Hello!" }

    try {
        await pushService.sendPush(userId, payload);
        res.json({ message: 'Push sent' });
    } catch (err) {
        console.error('Error sending push:', err);
        res.status(500).json({ error: 'Push failed' });
    }
};