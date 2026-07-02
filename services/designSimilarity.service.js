const DesignEmbedding = require('../models/designEmbedding.model');

const VECTOR_INDEX = process.env.DESIGN_EMBEDDING_INDEX || 'design_embedding_index';

/**
 * Insert one row into DesignEmbedding.
 */
exports.indexDesign = async ({ enquiryId, type, version, key, category, description, tags, embedding }) => {
    return await DesignEmbedding.create({
        EnquiryId: enquiryId,
        Type: type,
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
 * Filters to reference/coral/cad types and excludes the originating enquiry.
 */
exports.findSimilar = async ({ embedding, limit = 5, excludeEnquiryId, filter: extraFilter, skipEnquiryLookup = false }) => {
    const filter = extraFilter || { Type: { $in: ['reference', 'coral', 'cad'] } };
    if (excludeEnquiryId) filter.EnquiryId = { $ne: excludeEnquiryId };

    const pipeline = [
        {
            $vectorSearch: {
                index: VECTOR_INDEX,
                path: 'Embedding',
                queryVector: embedding,
                numCandidates: Math.max(limit * 4, 100),
                limit: Math.max(limit * 2, 20),
                filter,
            },
        },
        ...(skipEnquiryLookup
            ? []
            : [
                { $lookup: { from: 'enquiries', localField: 'EnquiryId', foreignField: '_id', as: 'enquiry' } },
                { $match: { 'enquiry.0': { $exists: true } } },
              ]),
        { $limit: limit },
        {
            $project: {
                _id: 0,
                EnquiryId: 1,
                Type: 1,
                Version: 1,
                Key: 1,
                score: { $meta: 'vectorSearchScore' },
            },
        },
    ];

    return await DesignEmbedding.aggregate(pipeline);
};
