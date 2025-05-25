const repo = require('../repositories/client.repo');


exports.getClients = async () => {
    try {
      return await repo.getAllClients(); // Await the promise from the repository
    } catch (err) {
      throw new Error('Error fetching clients: ' + err.message);
    }
  };
  
  exports.getClient = async (id) => {
    try {
      return await repo.getClientById(id); // Await the promise from the repository
    } catch (err) {
      throw new Error('Error fetching client: ' + err.message);
    }
  };
  
  exports.createClient = async (data) => {
    try {
      return await repo.createClient(data); // Await the promise from the repository
    } catch (err) {
      throw new Error('Error creating client: ' + err.message);
    }
  };
  
  exports.updateClient = async (id, data) => {
    try {
      return await repo.updateClient(id, data); // Await the promise from the repository
    } catch (err) {
      throw new Error('Error updating client: ' + err.message);
    }
  };
  
