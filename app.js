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

const app = express();
const server = http.createServer(app);

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

// API routes
app.use('/api', routes);

// Initialize DB and Server
const startApp = async () => {
  await connectDB();

  // Start WebSocket server
  initSocket(server);
  pushService.initPushService(
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
    process.env.GMAIL_USER
  );

  // Start HTTP server
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startApp();