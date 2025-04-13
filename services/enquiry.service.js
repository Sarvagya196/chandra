const repo = require('../repositories/enquiry.repo');

exports.getEnquiries = () => repo.getAllEnquiries();
exports.getEnquiry = id => repo.getEnquiryById(id);
exports.createEnquiry = data => repo.createEnquiry(data);
exports.updateEnquiry = (id, data) => repo.updateEnquiry(id, data);
