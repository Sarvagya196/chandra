const DesignEmbedding = require('../models/designEmbedding.model');

const VECTOR_INDEX = process.env.DESIGN_EMBEDDING_INDEX || 'design_embedding_index';

/**
 * Insert one row into DesignEmbedding.
 */
exports.indexDesign = async ({ enquiryId, type, version, key, description, tags, embedding }) => {
    return await DesignEmbedding.create({
        EnquiryId: enquiryId,
        Type: type,
        Version: version || null,
        Key: key,
        Description: description,
        Tags: tags || [],
        Embedding: embedding,
    });
};

/**
 * Vector-search the corpus for designs similar to the given embedding.
 * Filters to coral/cad rows and excludes the originating enquiry.
 */
exports.findSimilar = async ({ embedding, limit = 5, excludeEnquiryId }) => {
    const pipeline = [
        {
            $vectorSearch: {
                index: VECTOR_INDEX,
                path: 'Embedding',
                queryVector: embedding,
                numCandidates: 100,
                limit,
                filter: {
                    Type: { $in: ['reference', 'coral', 'cad'] },
                    ...(excludeEnquiryId ? { EnquiryId: { $ne: excludeEnquiryId } } : {}),
                },
            },
        },
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
