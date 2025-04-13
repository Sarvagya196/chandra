const repo = require('../repositories/client.repo');

exports.getClients = () => repo.getAllClients();
exports.getClient = id => repo.getClientById(id);
exports.createClient = data => repo.createClient(data);
exports.updateClient = (id, data) => repo.updateClient(id, data);
