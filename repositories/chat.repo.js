const Message = require('../models/message.model');

exports.createMessage = async (message) => {
    try {
        return await Message.create(message);
    } catch (error) {
        throw new Error('Error creating message: ' + error.message);
    }
};

exports.getMessages = async (enquiryId) => {
    try {
        return await Message.find({ enquiryId: enquiryId }).sort({ timestamp: 1 });
    } catch (error) {
        throw new Error('Error fetching messages: ' + error.message);
    }
}