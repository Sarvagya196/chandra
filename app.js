const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const bodyParser = require('body-parser');
const http = require('http');
const connectDB = require('./config/db');
const routes = require('./routes');
const initSocket = require('./utils/socket'); // 🧠 Import socket logic
const pushService = require('./services/pushNotification.service');
const { createRolesCodelist } = require('./utils/populateCodelists');
const { createStatusCodelist } = require('./utils/populateCodelists');

const app = express();
const server = http.createServer(app);

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// CORS setup
app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://workflow-ui-virid.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static('public'));

// API routes
app.use('/api', routes);

// Initialize DB and Server
const startApp = async () => {
  await connectDB();

  // Start WebSocket server
  initSocket(server);

  // Start HTTP server
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // createRolesCodelist(); populate roles codelist
    // createStatusCodelist(); populate status codelist
  });
};

startApp();