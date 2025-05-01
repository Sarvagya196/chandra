const repo = require('../repositories/enquiry.repo');

exports.getEnquiries = () => repo.getAllEnquiries();
exports.getEnquiry = id => repo.getEnquiryById(id);


exports.createEnquiry = async (data) => {
    const { AssignedTo, Status, AddedBy, ...rest } = data;

    const StatusHistory = [
        {
            Status: 'Enquiry Created',
            Timestamp: new Date(),
            AddedBy: AddedBy || 'System'
        }
    ];

    if (AssignedTo && Status) {
        StatusHistory.push({
            Status: Status,
            Timestamp: new Date(),
            AssignedTo: AssignedTo,
            AddedBy: AddedBy || 'System'
        });
    }

    // Combine all fields and pass to repository
    const enquiryData = {
        ...rest,
        AssignedTo,
        Status,
        AddedBy,
        StatusHistory
    };

    return { _id: enquiry._id };
};


exports.updateEnquiry = async (id, data) => {
    const enquiry = await repo.getEnquiryById(id);
    if (!enquiry) {
        throw new Error('Enquiry not found');
    }

    const updatedFields = {};
    const changes = [];

    // Loop through fields in the request and compare with existing data
    for (const key in data) {
        if (data.hasOwnProperty(key) && enquiry[key] !== data[key]) {
            changes.push(`${key}: from "${enquiry[key]}" to "${data[key]}"`);
            updatedFields[key] = data[key];
        }
    }

    // If there are changes, update and push to StatusHistory
    if (changes.length > 0) {
        const statusEntry = {
            Status: data.Status,
            Timestamp: new Date(),
            AddedBy: data.AddedBy || 'System',
            Description: changes.join(', ')
        };

        // Push the status history entry
        enquiry.StatusHistory.push(statusEntry);

        // Update fields
        Object.assign(enquiry, updatedFields);

        await enquiry.save();
    }

    return { _id: enquiry._id }; // return _id for consistency
};

