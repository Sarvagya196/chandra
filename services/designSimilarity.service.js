const designRepo = require('../repositories/design.repo');

const VECTOR_INDEX = 'design_embedding_index';
const TEXT_VECTOR_INDEX = 'design_text_embedding_index';

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

    const matchPipeline = [
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
        { $group: { _id: '$EnquiryId', score: { $max: '$score' } } },
        { $sort: { score: -1 } },
        { $limit: limit },
    ];

    const matches = await designRepo.aggregate(matchPipeline);
    if (!matches.length) return [];

    const enquiryIds = matches.map(m => m._id);
    const scoreMap = {};
    matches.forEach(m => { scoreMap[String(m._id)] = m.score; });

    const groupPipeline = [
        { $match: { EnquiryId: { $in: enquiryIds } } },
        { $sort: { CreatedAt: -1 } },
        {
            $group: {
                _id: '$EnquiryId',
                docId: { $first: '$_id' },
                Name: { $first: '$Name' },
                Key: { $first: '$Key' },
                versions: { $addToSet: '$Version' },
                images: { $push: { designId: '$_id', key: '$Key', version: '$Version' } },
            },
        },
        {
            $project: {
                _id: 0,
                enquiryId: '$_id',
                docId: 1,
                Name: 1,
                Key: 1,
                versions: 1,
                images: 1,
            },
        },
    ];

    const results = await designRepo.aggregate(groupPipeline);
    results.forEach(r => { r.score = scoreMap[String(r.enquiryId)] || 0; });
    results.sort((a, b) => b.score - a.score);
    return results;
};

exports.findSimilarByText = async ({ textEmbedding, limit = 5, excludeEnquiryId, filter: extraFilter, skipEnquiryLookup = false }) => {
    const filter = extraFilter || { DesignType: { $in: ['coral', 'cad'] }, TextEmbedding: { $exists: true, $ne: [] } };
    if (excludeEnquiryId) filter.EnquiryId = { $ne: excludeEnquiryId };

    const matchPipeline = [
        {
            $vectorSearch: {
                index: TEXT_VECTOR_INDEX,
                path: 'TextEmbedding',
                queryVector: textEmbedding,
                numCandidates: 1000,
                limit: 50,
                filter,
            },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $match: { score: { $gte: 0.85 } } },
        ...(skipEnquiryLookup
            ? []
            : [
                { $lookup: { from: 'enquiries', localField: 'EnquiryId', foreignField: '_id', as: 'enquiry' } },
                { $match: { 'enquiry.0': { $exists: true } } },
              ]),
        { $group: { _id: '$EnquiryId', score: { $max: '$score' } } },
        { $sort: { score: -1 } },
        { $limit: limit },
    ];

    const matches = await designRepo.aggregate(matchPipeline);
    if (!matches.length) return [];

    const enquiryIds = matches.map(m => m._id);
    const scoreMap = {};
    matches.forEach(m => { scoreMap[String(m._id)] = m.score; });

    const groupPipeline = [
        { $match: { EnquiryId: { $in: enquiryIds } } },
        { $sort: { CreatedAt: -1 } },
        {
            $group: {
                _id: '$EnquiryId',
                docId: { $first: '$_id' },
                Name: { $first: '$Name' },
                Key: { $first: '$Key' },
                versions: { $addToSet: '$Version' },
                images: { $push: { designId: '$_id', key: '$Key', version: '$Version' } },
            },
        },
        {
            $project: {
                _id: 0,
                enquiryId: '$_id',
                docId: 1,
                Name: 1,
                Key: 1,
                versions: 1,
                images: 1,
            },
        },
    ];

    const results = await designRepo.aggregate(groupPipeline);
    results.forEach(r => { r.score = scoreMap[String(r.enquiryId)] || 0; });
    results.sort((a, b) => b.score - a.score);
    return results;
};
