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

// Bulk delete enquiries by array of ids
exports.deleteMany = (ids) => {
    return Enquiry.deleteMany({ _id: { $in: ids } });
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

/**
 * Builds and executes the dynamic aggregation pipeline for enquiry search.
 */
/**
 * Builds and executes the dynamic aggregation pipeline.
 * @param {string} searchTerm - The value from the main search bar.
 * @param {object} filters - Key-value pairs for specific field filters.
 * @param {object} sort - The sort object (e.g., { CreatedDate: -1 }).
 * @param {object} pagination - { skip, limit }.
 */
exports.search = async (searchTerm, filters, sort, pagination) => {
    
    // --- 1. Build the Initial $match Stage (Search + Filters) ---
    const matchQuery = {};

    // --- A. Apply Search Term (if it exists) ---
    if (searchTerm) {
        // This $or query searches multiple fields for the same term
        // This is where you define your "searchable fields"
        matchQuery.$or = [
            { Name: { $regex: searchTerm, $options: 'i' } },
            { StyleNumber: { $regex: searchTerm, $options: 'i' } },
            { "Coral.CoralCode": { $regex: searchTerm, $options: 'i' } },
            { "Cad.CadCode": { $regex: searchTerm, $options: 'i' } },
            { GatiOrderNumber: { $regex: searchTerm, $options: 'i' } },
        ];
    }

    // --- B. Apply Specific Filters ---
    
    // ID (filterable)
    if (filters.id) {
        try {
            const idList = filters.id.split(',').map(id => new mongoose.Types.ObjectId(id.trim()));
            matchQuery._id = { $in: idList };
        } catch (e) { /* ignore invalid ObjectId */ }
    }
    // Category (filterable)
    if (filters.category) {
        matchQuery.Category = filters.category;
    }
    // Client (filterable)
    if (filters.clientId) {
        matchQuery.ClientId = filters.clientId;
    }
    // Priority (filterable)
    if (filters.priority) {
        matchQuery.Priority = filters.priority;
    }
    // Metal Details (filterable)
    if (filters.metalColor) {
        matchQuery["Metal.Color"] = filters.metalColor;
    }
    if (filters.metalQuality) {
        matchQuery["Metal.Quality"] = filters.metalQuality;
    }
    // Stone Type (filterable)
    if (filters.stoneType) {
        matchQuery.StoneType = filters.stoneType;
    }
    // ShippingDate Range
    if (filters.shippingDateFrom || filters.shippingDateTo) {
        matchQuery.ShippingDate = {};
        if (filters.shippingDateFrom) matchQuery.ShippingDate.$gte = new Date(filters.shippingDateFrom);
        if (filters.shippingDateTo) matchQuery.ShippingDate.$lte = new Date(filters.shippingDateTo);
    }


    // --- 2. Build the Post-Computation $match Stage ---
    // These filters must run *after* $addFields (Stage 3)
    const postMatchQuery = {};
    
    // Status (filterable)
    if (filters.status) {
        postMatchQuery.CurrentStatus = filters.status;
    }
    // AssignedTo (filterable)
    if (filters.assignedTo) {
        postMatchQuery.AssignedTo = filters.assignedTo;
    }
    // AssignedDate (filterable range)
    if (filters.assignedDateFrom || filters.assignedDateTo) {
        postMatchQuery.AssignedDate = {};
        if (filters.assignedDateFrom) postMatchQuery.AssignedDate.$gte = new Date(filters.assignedDateFrom);
        if (filters.assignedDateTo) postMatchQuery.AssignedDate.$lte = new Date(filters.assignedDateTo);
    }
    // CreatedDate (filterable range)
    if (filters.createdDateFrom || filters.createdDateTo) {
        postMatchQuery.CreatedDate = {};
        if (filters.createdDateFrom) postMatchQuery.CreatedDate.$gte = new Date(filters.createdDateFrom);
        if (filters.createdDateTo) postMatchQuery.CreatedDate.$lte = new Date(filters.createdDateTo);
    }

    const pipelineSort = { ...sort }; // Make a copy of the sort object
    if (pipelineSort.priority) {
      // 'Priority' exists in the sort object (e.g., { Priority: -1 })

      // 1. Get the sort direction (1 for asc, -1 for desc)
      const sortDirection = pipelineSort.priority;

      // 2. Remove the old string-based sort key
      delete pipelineSort.priority;

      // 3. Add the new number-based sort key
      pipelineSort.PriorityOrder = sortDirection;
    }
      
    // --- 3. Define the Aggregation Pipeline ---
    const pipeline = [
        // STAGE 1: Initial Filter (on indexed fields)
        { $match: matchQuery },

        // STAGE 2: Compute All Required Fields
        {
            $addFields: {
                firstStatus: { $arrayElemAt: ["$StatusHistory", 0] },
                lastStatus: { $arrayElemAt: ["$StatusHistory", -1] },
                finalCad: { $arrayElemAt: [{ $filter: { input: "$Cad", as: "c", cond: { $eq: ["$$c.IsFinalVersion", true] } } }, 0] },
                lastCad: { $arrayElemAt: ["$Cad", -1] },
                approvedCoral: { $arrayElemAt: [{ $filter: { input: "$Coral", as: "co", cond: { $eq: ["$$co.IsApprovedVersion", true] } } }, 0] },
                lastCoral: { $arrayElemAt: ["$Coral", -1] }
            }
        },
        
        // STAGE 3: Compute Final Fields (and Image Logic)
        {
            $addFields: {
                // Fields for filtering/sorting
                CurrentStatus: "$lastStatus.Status",
                AssignedTo: "$lastStatus.AssignedTo",
                AssignedDate: "$lastStatus.Timestamp",
                CreatedDate: "$firstStatus.Timestamp",

                // Convert Priority string to a sortable number
                PriorityOrder: {
                    $switch: {
                        branches: [
                            { case: { $eq: ["$Priority", "Super High"] }, then: 2 },
                            { case: { $eq: ["$Priority", "High"] }, then: 1 }
                        ],
                        default: 0 // "Normal" or any other value will be 0
                    }
                },
                
                // Complex Image Logic
                ComputedImages: {
                    $cond: {
                        if: { $ifNull: ["$finalCad", false] }, then: "$finalCad.Images",
                        else: { $cond: {
                            if: { $ifNull: ["$lastCad", false] }, then: "$lastCad.Images",
                            else: { $cond: {
                                if: { $ifNull: ["$approvedCoral", false] }, then: "$approvedCoral.Images",
                                else: { $cond: {
                                    if: { $ifNull: ["$lastCoral", false] }, then: "$lastCoral.Images",
                                    else: { $cond: {
                                        if: { $ifNull: ["$ReferenceImages", false] }, then: "$ReferenceImages",
                                        else: [] 
                                    }}
                                }}
                            }}
                        }}
                    }
                }
            }
        },

        // STAGE 4: Second Filter (on computed fields)
        // Only add this stage if there are computed filters to apply
        ...(Object.keys(postMatchQuery).length > 0 ? [{ $match: postMatchQuery }] : []),

        // STAGE 5: Sorting (on any computed or top-level field)
        { $sort: pipelineSort },

        // STAGE 6: Pagination and Final Projection ($facet)
        {
            $facet: {
                metadata: [ { $count: 'total' } ],
                data: [
                    { $skip: pagination.skip },
                    { $limit: pagination.limit },
                    {
                        $project: {
                            Name: 1,
                            Category: 1,
                            CurrentStatus: 1,
                            ClientId: 1,
                            ReferenceImages: "$ComputedImages",
                            AssignedTo: 1,
                            AssignedDate: 1,
                            CreatedDate: 1,
                            Priority: 1,
                            Metal: 1,
                            StoneType: 1,
                            ShippingDate: 1
                            // Note: _id is included by default
                        }
                    }
                ]
            }
        }
    ];

    // --- 4. Execute the pipeline ---
    const result = await Enquiry.aggregate(pipeline);

    const data = result[0].data;
    const total = result[0].metadata[0]?.total || 0;

    return { data, total };
};

const AGGREGATE_CLIENT_STATUSES = [
    "Enquiry Created",
    "Coral",
    "CAD",
    "Approved Cad",
    "Quotation",
];


/**
 * Aggregates enquiry counts by a dynamic field, with optional filters.
 * @param {string} groupBy - The field to group by ('status' or 'client').
 * @param {object} filters - Optional filters (e.g., { clientId: '...', assignedTo: '...' }).
 */
exports.aggregateBy = async (groupBy, filters = {}) => {
    
    let pipeline = [];
    const matchStage = {};      // For filters on top-level fields
    const postMatchStage = {};  // For filters on computed fields

    // --- 1. Build Initial Match Stage ---
    // Add top-level filters (like ClientId) here
    if (filters.clientId) {
        matchStage.ClientId = filters.clientId;
    }
    
    // Add the initial match stage to the pipeline if it has any filters
    if (Object.keys(matchStage).length > 0) {
        pipeline.push({ $match: matchStage });
    }

    // --- 2. Build Grouping & Computed Field Logic ---
    let groupStage = {};
    let needsAssignedTo = !!filters.assignedTo || (groupBy === 'status' && filters.assignedTo);

    // We must compute fields *before* we can filter on them
    const fieldsToAdd = {};    
    fieldsToAdd.CurrentStatus = { $arrayElemAt: ["$StatusHistory.Status", -1] };
    if (needsAssignedTo) {
        fieldsToAdd.AssignedTo = { $arrayElemAt: ["$StatusHistory.AssignedTo", -1] };
    }
    
    pipeline.push({ $addFields: fieldsToAdd });
    
    // --- 3. Build Post-Match Stage (for computed fields) ---
    if (filters.assignedTo) {
        postMatchStage.AssignedTo = filters.assignedTo;
    }

    // When grouping by client → restrict to allowed statuses
    if (groupBy === "client") {
        postMatchStage.CurrentStatus = { $in: AGGREGATE_CLIENT_STATUSES };
    }

    if (Object.keys(postMatchStage).length > 0) {
        pipeline.push({ $match: postMatchStage });
    }

    // --- 4. Define Group Stage ---
    switch (groupBy) {
        case 'status':
            groupStage = {
                _id: "$CurrentStatus", // Group by the computed 'CurrentStatus'
                count: { $sum: 1 }
            };
            break;
        case 'client':
            groupStage = {
                _id: "$ClientId", // Group by the top-level 'ClientId'
                count: { $sum: 1 }
            };
            break;
    }

    // --- 5. Add Grouping and Final Projection ---
    pipeline.push({ $group: groupStage });

    pipeline.push({
        $project: {
            _id: 0,
            name: "$_id", 
            count: 1
        }
    });
    
    pipeline.push({ $sort: { count: -1 } }); 

    return Enquiry.aggregate(pipeline);
};

// Bulk append status to multiple enquiries, copying AssignedTo from last entry
exports.bulkAppendStatus = async (ids, { Status, AddedBy }) => {

    // 1️⃣ Fetch last status entry for each enquiry
    const enquiries = await Enquiry.find(
        { _id: { $in: ids } },
        { StatusHistory: { $slice: -1 } } // only fetch the last entry
    ).lean();

    // 2️⃣ Build bulk updates with copied AssignedTo
    const updates = enquiries.map(enquiry => {
        const last = enquiry?.StatusHistory?.[0] || {};
        const assignedTo = last.AssignedTo || null;

        return {
            updateOne: {
                filter: { _id: enquiry._id },
                update: {
                    $push: {
                        StatusHistory: {
                            Status,
                            AssignedTo: assignedTo,
                            AddedBy,
                            Timestamp: new Date(),
                            Details: `Mass status update → ${Status}`
                        }
                    }
                }
            }
        };
    });

    return Enquiry.bulkWrite(updates);
};