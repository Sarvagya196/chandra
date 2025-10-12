const repo = require('../repositories/chat.repo');
const { uploadToS3 } = require('../utils/s3');

exports.createMessage = async (data) => {
    try {
        return await repo.createMessage(data);
    } catch (err) {
        throw new Error('Error creating message: ' + err.message);
    }
};

exports.getMessages = async (enquiryId) => {
    try {
        return await repo.getMessages(enquiryId);
    } catch (err) {
        throw new Error('Error getting messages: ' + err.message);
    }
}

//Delete all messages for an enquiry
exports.deleteMessages = async (enquiryId) => {
    try {
        return await repo.deleteMessages(enquiryId);
    } catch (err) {
        throw new Error('Error deleting messages: ' + err.message);
    }
};

exports.uploadMedia = async (file) => {
    return await uploadToS3(file);
}

