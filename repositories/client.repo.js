const Client = require('../models/client.model');

// Get all clients
exports.getAllClients = async () => {
    try {
      return await Client.find();  // returns a promise
    } catch (error) {
      throw new Error('Error fetching all clients: ' + error.message);
    }
  };
  
  // Get client by ID
  exports.getClientById = async (id) => {
    try {
      return await Client.findById(id);
    } catch (error) {
      throw new Error('Error fetching client by ID: ' + error.message);
    }
  };
  
  // Create a new client
  exports.createClient = async (client) => {
    try {
      return await Client.create(client);  // returns a promise
    } catch (error) {
      throw new Error('Error creating client: ' + error.message);
    }
  };
  
  // Update a client by ID
  exports.updateClient = async (id, data) => {
    try {
      return await Client.findByIdAndUpdate( id, data, { new: true });  // returns a promise
    } catch (error) {
      throw new Error('Error updating client: ' + error.message);
    }
  };
  
