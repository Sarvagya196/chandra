const service = require('../services/user.service');

exports.getUsers = async (req, res) => {
    try{
        const users = await service.getUsers();
        res.json(users);
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
