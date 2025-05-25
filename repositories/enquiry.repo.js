const Enquiry = require('../models/enquiry.model');

// Get all enquiries
exports.getAllEnquiries = async () => {
    return await Enquiry.find();
};

// Get enquiry by MongoDB _id
exports.getEnquiryById = async (id) => {
    return await Enquiry.findById(id);
};

// Create a new enquiry
exports.createEnquiry = async (enquiry) => {
    return await Enquiry.create(enquiry);
};

// Update an existing enquiry by _id and return the updated doc
exports.updateEnquiry = async (id, updatedEnquiry) => {
    return await Enquiry.findByIdAndUpdate(id, updatedEnquiry, { new: true });
};
