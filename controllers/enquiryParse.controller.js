const service = require('../services/enquiryParse.service');

exports.parseEnquiry = async (req, res) => {
    try {
        const { message, mediaType } = req.body;
        if (!message) return res.status(400).json({ message: 'message is required' });
        const result = await service.parseEnquiryMessage({ message, mediaType });
        res.json(result);
    } catch (err) {
        console.error('Error parsing enquiry message:', err);
        res.status(500).json({ message: 'Failed to parse enquiry message' });
    }
};
