const service = require('../services/client.service');

exports.getClients = async (req, res) => {
    const clients = await service.getClients();
    res.json(clients);
};

exports.createClient = async (req, res) => {
    const client = await service.createClient(req.body);
    res.status(201).json(client);
};

exports.updateClient = async (req, res) => {
    const client = await service.updateClient(req.params.id, req.body);
    res.json(client);
};
