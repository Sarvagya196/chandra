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

// Get enquiries by client id
exports.getEnquiriesByClientId = async (clientId) => {
  return await Enquiry.find({ ClientId: clientId });
}

// Get enquiries by user id (from Participants)
exports.getEnquiriesByUserId = async (userId) => {
  try {
    const enquiries = await Enquiry.aggregate([
      {
        $addFields: {
          lastStatus: { $arrayElemAt: ["$StatusHistory", -1] }
        }
      },
      {
        $match: {
          "lastStatus.AssignedTo": userId
        }
      },
      {
        $project: { lastStatus: 0 }
      }
    ]);

    res.json(enquiries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching enquiries" });
  }
};

// Create a new enquiry
exports.createEnquiry = async (enquiry) => {
    return await Enquiry.create(enquiry);
};

// Delete an enquiry by _id
exports.deleteEnquiry = async (id) => {
    return await Enquiry.findByIdAndDelete(id);
};

exports.updateEnquiry = async (id, updatedEnquiry) => {
  // 1️⃣ Fetch existing document
  const existing = await Enquiry.findById(id).lean();
  if (!existing) throw new Error(`Enquiry ${id} not found`);

  // 2️⃣ Deep merge updatedEnquiry into existing
  // _.merge merges objects deeply, but replaces arrays entirely by default
  const merged = lodash.merge({}, existing, updatedEnquiry);

  // 3️⃣ Update DB safely using $set
  const result = await Enquiry.findByIdAndUpdate(
    id,
    { $set: merged },
    { new: true, runValidators: true }
  );

  return result;
};