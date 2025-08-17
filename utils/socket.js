// socket.js
const { Server } = require('socket.io');
const chatController = require('../controllers/chat.controller');
const pushService = require('../services/pushNotification.service');
const userService = require('../services/user.service');
const enquiryService = require('../services/enquiry.service');
const sendMail = require('./email').sendMail;

let frontendUrl = process.env.NODE_ENV === 'production' ? 'https://workflow-ui-virid.vercel.app' : 'http://localhost:4200';

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
            if (socket.data.enquiryId) {
                socket.leave(`enquiry_${socket.data.enquiryId}`);
            }
            socket.data.userId = userId;
            socket.data.enquiryId = enquiryId;
            console.log(`🟢 ${userId} joined room enquiry_${enquiryId}`);
            await enquiryService.handleEnquiryParticipants(enquiryId, userId, true);
        });

        socket.on('leaveRoom', async ({ enquiryId, userId }) => {
            socket.leave(`enquiry_${enquiryId}`);
            socket.data.enquiryId = null;
            await enquiryService.handleEnquiryParticipants(enquiryId, userId, false);
            console.log(`🔴 Left room enquiry_${enquiryId}`);
        });

        socket.on('joinNotificationRoom', async (userId) => {
            socket.join(`user_${userId}`);
            console.log(`🟢 ${userId} joined room notifications`);
        });

        socket.on('leaveNotificationRoom', async (userId) => {
            socket.leave(`user_${userId}`);
            console.log(`🟢 ${userId} left room notifications`);
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

                var recipients = await enquiryService.getEnquiryParticipants(enquiryId);
                console.log(`🔔 Recipients for enquiry ${enquiryId}:`, recipients);
                recipients = recipients.filter(participant => participant.UserId !== userId && participant.IsActive === false);
                console.log(`🔔 Notifying ${recipients.length} participants of enquiry ${enquiryId}`);

                for (const recipient of recipients) {
                    console.log(`🔔 Notifying user ${recipient.UserId} about new message in enquiry ${enquiryId}`);
                    // 🔹 First send socket notification (if they are connected but not in the enquiry room)
                    io.to(`user_${recipient.UserId}`).emit('messageNotification', saved);

                    // 🔹 Then also send push if they’re offline / not connected
                    const subscription = await pushService.getSubscription(recipient.UserId);
                    console.log(`🔔 Push subscription for user ${recipient.UserId}:`, subscription);
                    if (subscription) {
                        try {
                            await pushService.sendPush(recipient.UserId, {
                                title: `New message in enquiry ${enquiryId}`,
                                body: messageType === 'text' ? message : `📎 ${mediaName || 'New file'}`,
                                url: `${frontendUrl}/enquiries/${enquiryId}`
                            });
                        } catch (err) {
                            console.error(`Failed to push to user ${recipient.UserId}`, err);
                        }
                    }

                    // 🔹 Then also send mail if they’re offline / not connected always
                    try {
                        const recipientUser = await userService.getUserById(recipient.UserId);
                        if (!recipientUser || !recipientUser.email) {
                            // If no email, skip sending email notification
                            console.warn(`No email for user ${recipient.UserId}, skipping email notification`);
                            continue;
                        }
                        await sendMail(
                            recipientUser.email, // make sure recipients array has email addresses
                            `New message in enquiry ${enquiryId}`,
                            `
                    <p>Hello ${recipientUser.name || ''},</p>
                    <p>You have a new message in enquiry <b>${enquiryId}</b>.</p>
                    <p>${messageType === 'text' ? message : `📎 ${mediaName || 'New file'}`}</p>
                    <p><a href="${frontendUrl}/enquiries/${enquiryId}">View Enquiry</a></p>
                `,
                            `New message in enquiry ${enquiryId}: ${messageType === 'text' ? message : mediaName || 'New file'}`
                        );
                    } catch (err) {
                        console.error(`❌ Failed to email user ${recipient.UserId}`, err);
                    }
                }

            } catch (err) {
                console.error('Chat message error:', err);
                socket.emit('error', { message: 'Failed to save message' });
            }
        });

        socket.on('disconnect', () => {
            if (socket.data.enquiryId && socket.data.userId) {
                enquiryService.handleEnquiryParticipants(socket.data.enquiryId, socket.data.userId, false);
            }
            socket.leaveAll();
            socket.data.enquiryId = null;
            socket.data.userId = null;
            console.log('⚡ Client disconnected:', socket.id);
        });
    });

    return io;
}

module.exports = initSocket;
