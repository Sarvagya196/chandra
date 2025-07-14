const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const routes = require('./routes');

const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'https://workflow-ui-virid.vercel.app'
];

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

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
