const service = require('../services/user.service');

exports.getUsers = async (req, res) => {
    try {
      const users = await service.getUsers();

      const filteredUsers = users.map(user => ({
        Id: user._id,
        Name: user.name,
        Role: user.role
      }));
  
      res.json(filteredUsers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

exports.getUserById = async (req, res) => {
    try {
        const user = await service.getUserById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.savePushToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Push token is required' });
    }
    await service.savePushToken(userId, token);
    res.status(200).json({ message: 'Push token saved successfully' });
  } catch (error) {
    console.error('Error saving push token:', error);
    res.status(500).json({ message: 'Failed to save push token' });
  }
};