const service = require('../services/enquiry.service');

exports.getEnquiries = async (req, res) => {
    try {
        const enquiries = await service.getEnquiries();
        res.json(enquiries);
    } catch (error) {
        console.error("Error fetching enquiries:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getEnquiryById = async (req, res) => {
    try {
        const enquiries = await service.getEnquiry(req.params.id);
        res.json(enquiries);
    } catch (error) {
        console.error("Error fetching enquiries:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.createEnquiry = async (req, res) => {
    const userId = req.user._id;
    try {
        const enquiry = await service.createEnquiry(req.body, userId);
        res.status(201).json(enquiry);
    } catch (error) {
        console.error("Error creating enquiry:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.updateEnquiry = async (req, res) => {
    const userId = req.user._id;
    try {
        const enquiry = await service.updateEnquiry(req.params.id, req.body, userId);
        res.json(enquiry);
    } catch (error) {
        console.error("Error updating enquiry:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.uploadAssets = async (req, res) => {
    const { id, type } = req.params;
    const files = req.files;
    const version = req.body.version;
    const userId = req.user._id;
  
    try {
      const result = await service.handleAssetUpload(id, type, files, version, userId);
      res.status(200).json({ message: 'Upload successful', data: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
};

exports.updateAssets = async (req, res) => {
    const { id, type } = req.params;
    const version = req.query.version;
    const data = req.body;
    const userId = req.user._id;

    if (!version) {
        return res.status(400).json({ message: 'Version is required' });
    }

    try {
        const result = await service.updateAssetData(id, type, version, data, userId);
        res.status(200).json({ message: 'Media updated successfully', data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Update failed', error: err.message });
    }
};
  

exports.getPresignedFileUrl = async (req, res) => {
    try {
      const { key } = req.params;
      const action = req.query.download === 'true' ? 'download' : 'view';
      const url = await service.getPresignedUrl(key, action);
      res.json({ url });
    } catch (err) {
      console.error('Error generating presigned URL:', err);
      res.status(500).json({ error: 'Failed to generate URL' });
    }
};

exports.getPricing = async (req, res) => {
    try {
        const detailsJson = req.body.details;
        if (!detailsJson) {
            return res.status(400).json({ message: "Details parameter is required" });
        }
        const clientId = req.body.clientId;
        const pricing = await service.calculatePricing(detailsJson, clientId);
        res.json(pricing);
    } catch (error) {
        console.error("Error calculating pricing:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};