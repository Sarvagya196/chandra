const service = require('../services/enquiry.service');

exports.getEnquiries = async (req, res) => {
    const enquiries = await service.getEnquiries();
    res.json(enquiries);
};

exports.createEnquiry = async (req, res) => {
    const enquiry = await service.createEnquiry(req.body);
    res.status(201).json(enquiry);
};

exports.updateEnquiry = async (req, res) => {
    const enquiry = await service.updateEnquiry(req.params.id, req.body);
    res.json(enquiry);
};
