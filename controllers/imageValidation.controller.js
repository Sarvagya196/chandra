const service = require('../services/imageValidation.service');

exports.validateImage = async (req, res) => {
    const { enquiryId } = req.body;

    if (!enquiryId) {
        return res.status(400).json({ error: 'enquiryId is required' });
    }

    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'image is required' });
    }

    try {
        const result = await service.validateImage(enquiryId, file.buffer, file.mimetype);
        res.json(result);
    } catch (err) {
        const status = err.status || 500;
        console.error('[imageValidation] error:', err.message);
        res.status(status).json({ error: err.message || 'Validation failed' });
    }
};
