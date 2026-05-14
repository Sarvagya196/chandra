const service = require('../services/imagePricing.service');

exports.extractAndPrice = async (req, res) => {
    const { clientId, stoneType, quantity, metalQuality } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'image is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }
    if(!stoneType) {
        return res.status(400).json({ error: 'stoneType is required' });
    }

    try {
        const result = await service.extractAndPrice({
            imageBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            clientId,
            stoneType: stoneType || null,
            quantity: quantity ? parseInt(quantity, 10) : 1,
            metalQuality: metalQuality || null,
        });
        res.json(result);
    } catch (err) {
        const status = err.status || 500;
        console.error('[imagePricing] error:', err.message);
        res.status(status).json({ error: err.message || 'Image pricing failed' });
    }
};
