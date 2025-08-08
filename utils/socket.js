// socket.js
const { Server } = require('socket.io');
const chatController = require('../controllers/chat.controller');

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:4200',
        'https://workflow-ui-virid.vercel.app'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('joinRoom', async ({ enquiryId, userId }) => {
      socket.join(`enquiry_${enquiryId}`);
      console.log(`🟢 ${userId} joined room enquiry_${enquiryId}`);
    });

    socket.on('joinNotificationRoom', async (userId) => {
      socket.join(`user_${userId}`);
      console.log(`🟢 ${userId} joined room notifications`);
    });

    socket.on('leaveRoom', ({ enquiryId }) => {
      socket.leave(`enquiry_${enquiryId}`);
      console.log(`🔴 Left room enquiry_${enquiryId}`);
    });

    socket.on('newMessage', async (data) => {
      const { enquiryId, userId, message, messageType, mediaKey, mediaName } = data;

      try {
        const saved = await chatController.saveMessage({
          enquiryId,
          senderId: userId,
          message,
          messageType,
          mediaKey,
          mediaName
        });

        io.to(`enquiry_${enquiryId}`).emit('message', saved);

        // TODO: emit to notification room
        // const recipients = await getRecipients(enquiryId, userId);
        // recipients.forEach(recipientId => {
        //   io.to(`user_${recipientId}`).emit('messageNotification', saved);
        // });
      } catch (err) {
        console.error('Chat message error:', err);
        socket.emit('error', { message: 'Failed to save message' });
      }
    });

    socket.on('disconnect', () => {
      console.log('⚡ Client disconnected:', socket.id);
    });
  });

  return io;
}

module.exports = initSocket;
