const Enquiry = require('../models/enquiry.model');
const lodash = require('lodash');

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

// Delete an enquiry by _id
exports.deleteEnquiry = async (id) => {
    return await Enquiry.findByIdAndDelete(id);
};

// Update an existing enquiry by _id and return the updated doc
// exports.updateEnquiry = async (id, updatedEnquiry) => {
//     console.log("Updating enquiry fields called:", JSON.stringify(updatedEnquiry));

//     const existing = await Enquiry.findById(id).lean();
//     const merged = { ...existing, ...updatedEnquiry };

//     // Then update
//     return await Enquiry.findByIdAndUpdate(id, { $set: merged }, { new: true });
// };


exports.updateEnquiry = async (id, updatedEnquiry) => {
//   console.log('Updating enquiry fields called:', JSON.stringify(updatedEnquiry));

  // 1️⃣ Fetch existing document
  const existing = await Enquiry.findById(id).lean();
  if (!existing) throw new Error(`Enquiry ${id} not found`);

  // 2️⃣ Deep merge updatedEnquiry into existing
  // _.merge merges objects deeply, but replaces arrays entirely by default
  const merged = lodash.merge({}, existing, updatedEnquiry);
  console.log("Merged enquiry:", JSON.stringify(merged));

  // 3️⃣ Update DB safely using $set
  const result = await Enquiry.findByIdAndUpdate(
    id,
    { $set: merged },
    { new: true, runValidators: true }
  );

  return result;
};