const Client = require('../models/client.model');

exports.getAllClients = () => Client.find();
exports.getClientById = id => Client.findOne({ id });
exports.createClient = client => Client.create(client);
exports.updateClient = (id, data) => Client.findOneAndUpdate({ id }, data, { new: true });
