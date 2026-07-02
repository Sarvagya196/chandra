const { uploadToS3, generatePresignedUrl } = require('../utils/s3');
const { describeAndEmbedImage } = require('./imageDescribe.service');
const { generateEmbedding } = require('../utils/embedding');
const { extractPricingDataFromImage } = require('./imagePricing.service');
const { indexDesign, findSimilar } = require('./designSimilarity.service');
const Design = require('../models/designs.model');

exports.InsertDesign = async ({ designType, images, name, uploadedBy, mimeType, stones, metal, s3Key, enquiryId, indexEmbedding = true }) => {
    if (!s3Key) {
        const fileObj = { buffer: images, mimetype: mimeType, originalname: name || 'design' };
        s3Key = await uploadToS3(fileObj);
    }

    const pricingData = (stones || metal)
        ? { Metal: metal, Stones: stones || [] }
        : await extractPricingDataFromImage(images, mimeType);

    const descriptionResult = await describeAndEmbedImage({ s3Key, mimetype: mimeType });

    const design = await Design.create({
        Name: name,
        UploadedBy: uploadedBy,
        DesignType: designType,
        enquiryId: enquiryId || null,
        Metal: pricingData?.Metal ? (Array.isArray(pricingData.Metal) ? pricingData.Metal : [pricingData.Metal]) : [],
        stones: pricingData?.Stones || [],
        Images: [{
            Key: s3Key,
            Description: descriptionResult?.description || '',
            Tags: descriptionResult?.tags || [],
            Category: descriptionResult?.category || '',
            Group: descriptionResult?.group || '',
            Vector: descriptionResult?.embedding || [],
        }],
    });

    if (indexEmbedding && descriptionResult?.embedding) {
        await indexDesign({
            enquiryId: design._id,
            type: designType.toLowerCase(),
            key: s3Key,
            category: descriptionResult.category || '',
            description: descriptionResult.description || '',
            tags: descriptionResult.tags || [],
            embedding: descriptionResult.embedding,
        }).catch(err => console.error('[designs] failed to index embedding:', err.message));
    }

    return { design, descriptionResult };
};

exports.InsertDesignEmbedding = async ({ enquiryId, type, version, key, category, description, tags, embedding }) => {
    return await indexDesign({
        enquiryId,
        type,
        version,
        key,
        category,
        description,
        tags,
        embedding,
    });
};

exports.GetAllDesignTypes = async () => {
    try {
        const path = Design.schema.path('DesignType');
        if (path && path.enumValues && path.enumValues.length > 0) {
            return path.enumValues;
        }
    } catch (e) {}
    try {
        const types = await Design.distinct('DesignType');
        if (types && types.length > 0) return types;
    } catch (e) {}
    return ['coral', 'Cad'];
};

exports.getDesignById = async (id) => {
    const design = await Design.findById(id);
    if (!design) throw Object.assign(new Error('Design not found'), { status: 404 });

    const doc = design.toObject();
    doc.Images = await Promise.all((doc.Images || []).map(async (img) => {
        if (img.Key) img.Url = await generatePresignedUrl(img.Key);
        return img;
    }));

    return doc;
};

async function vectorSearchDesigns({ embedding, designType, category, skip = 0, limit = 10 }) {
    const filter = {};
    if (designType) filter.Type = designType.toLowerCase();
    if (category) filter.Category = category;

    let results = await findSimilar({
        embedding,
        limit: Math.max(skip + limit, 50),
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        skipEnquiryLookup: true,
    });

    results = results.filter(r => r.score >= 0.7);
    const pagedResults = results.slice(skip, skip + limit);

    const enquiryIds = pagedResults.map(r => r.EnquiryId).filter(Boolean);
    const designs = enquiryIds.length > 0
        ? await Design.find({ enquiryId: { $in: enquiryIds } }).lean()
        : [];

    const designMap = {};
    for (const d of designs) {
        designMap[d._id.toString()] = d;
    }

    const images = [];
    for (const r of pagedResults) {
        const design = designMap[r.EnquiryId?.toString()];
        if (!design) continue;

        for (const img of (design.Images || [])) {
            const url = img.Key ? await generatePresignedUrl(img.Key) : null;
            images.push({
                Url: url,
                Description: img.Description || '',
                Category: img.Category || '',
                designId: design._id,
                designType: design.DesignType,
            });
        }
    }

    return { images, total: images.length, skip, limit };
}

async function filterDesigns({ search, designType, category, skip = 0, limit = 10 }) {
    const match = {};
    if (search) match.Name = { $regex: search, $options: 'i' };
    if (designType) match.DesignType = designType;

    const imageMatch = {};
    if (category) imageMatch['Images.Category'] = category;
    if (search) {
        imageMatch.$or = [
            { 'Images.Description': { $regex: search, $options: 'i' } },
            { 'Images.Tags': { $regex: search, $options: 'i' } },
            { 'Images.Category': { $regex: search, $options: 'i' } },
        ];
    }

    const pipeline = [
        { $match: match },
        { $unwind: '$Images' },
        ...(Object.keys(imageMatch).length > 0 ? [{ $match: imageMatch }] : []),
        { $sort: { CreatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                Name: 1,
                DesignType: 1,
                'Images.Key': 1,
                'Images.Description': 1,
                'Images.Category': 1,
            },
        },
    ];

    const countPipeline = [
        { $match: match },
        { $unwind: '$Images' },
        ...(Object.keys(imageMatch).length > 0 ? [{ $match: imageMatch }] : []),
        { $count: 'total' },
    ];

    const [results, countResult] = await Promise.all([
        Design.aggregate(pipeline),
        Design.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    const images = await Promise.all(results.map(async (d) => {
        const url = d.Images?.Key ? await generatePresignedUrl(d.Images.Key) : null;
        return {
            Url: url,
            Description: d.Images?.Description || '',
            Category: d.Images?.Category || '',
            designId: d._id,
            designType: d.DesignType,
        };
    }));

    return { images, total, skip, limit };
}

exports.lookup = async ({ buffer, mimeType, search, designType, category, skip, limit }) => {
    if (buffer) {
        const embedding = await generateEmbedding(buffer, mimeType);
        return await vectorSearchDesigns({ embedding, designType, category, skip, limit });
    }

    if (search || designType || category) {
        return await filterDesigns({ search, designType, category, skip, limit });
    }

    return await filterDesigns({ skip, limit });
};
