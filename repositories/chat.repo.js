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

//Delete all messages for an enquiry
exports.deleteMessages = async (enquiryId) => {
    try {
        const result = await Message.deleteMany({ enquiryId });
        return result;
    } catch (err) {
        throw new Error('Error deleting messages: ' + err.message);
    }
};