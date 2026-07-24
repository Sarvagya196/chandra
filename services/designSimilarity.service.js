const designRepo = require('../repositories/design.repo');

const VECTOR_INDEX = process.env.DESIGN_EMBEDDING_INDEX || 'design_embedding_index';

/**
 * Insert one row into DesignEmbedding.
 */
exports.indexDesign = async ({ enquiryId, type, version, key, category, description, tags, embedding }) => {
    return await designRepo.create({
        EnquiryId: enquiryId,
        DesignType: type,
        Version: version || null,
        Key: key,
        Category: category,
        Description: description,
        Tags: tags || [],
        Embedding: embedding,
    });
};

/**
 * Vector-search the corpus for designs similar to the given embedding.
 * Only returns results where the source enquiry still exists in the database.
 * Filters to coral/cad types and excludes the originating enquiry.
 */
exports.findSimilar = async ({ embedding, limit = 5, excludeEnquiryId, filter: extraFilter, skipEnquiryLookup = false }) => {
    const filter = extraFilter || { DesignType: { $in: ['coral', 'cad'] } };
    if (excludeEnquiryId) filter.EnquiryId = { $ne: excludeEnquiryId };

    const pipeline = [
        {
            $vectorSearch: {
                index: VECTOR_INDEX,
                path: 'Embedding',
                queryVector: embedding,
                numCandidates: 1000,
                limit: 50,
                filter,
            },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $match: { score: { $gte: 0.9 } } },
        ...(skipEnquiryLookup
            ? []
            : [
                { $lookup: { from: 'enquiries', localField: 'EnquiryId', foreignField: '_id', as: 'enquiry' } },
                { $match: { 'enquiry.0': { $exists: true } } },
              ]),
        { $sort: { score: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                Name: 1,
                Key: 1,
                score: 1,
            },
        },
    ];

    return await designRepo.aggregate(pipeline);
};
