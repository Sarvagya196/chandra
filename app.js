const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const routes = require('./routes');

const app = express();
app.use(cors({
  origin: '*', // or use '*' if you're testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Optional: Handle preflight requests
app.options('*', cors());
app.use(bodyParser.json());

// Main function to run app
const startApp = async () => {
  await connectDB();          // Connect to MongoDB

  // Define routes
  app.use('/api', routes);

  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startApp(); // Run the app
