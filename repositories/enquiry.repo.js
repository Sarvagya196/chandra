const Enquiry = require('../models/enquiry.model');

exports.getAllEnquiries = () => Enquiry.find();
exports.getEnquiryById = id => Enquiry.findOne({ Id: id });
exports.createEnquiry = enquiry => Enquiry.create(enquiry);
exports.updateEnquiry = (id, data) => Enquiry.findOneAndUpdate({ Id: id }, data, { new: true });
