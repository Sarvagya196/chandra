const { uploadToS3, generatePresignedUrl } = require('../utils/s3');
const { describeAndEmbedImage } = require('./imageDescribe.service');
const { generateEmbedding } = require('../utils/embedding');
const { extractPricingDataFromImage } = require('./imagePricing.service');
const { findSimilar } = require('./designSimilarity.service');
const designRepo = require('../repositories/design.repo');

exports.insertDesign = async ({ designType, images, name, uploadedBy, mimeType, stones, metal, s3Key, enquiryId, indexEmbedding = true }) => {
    designType = designType?.toLowerCase();
    if (!s3Key) {
        const fileObj = { buffer: images, mimetype: mimeType, originalname: name || 'design' };
        s3Key = await uploadToS3(fileObj);
    }

    const pricingData = (stones || metal)
        ? { Metal: metal, Stones: stones || [] }
        : await extractPricingDataFromImage(images, mimeType);

    const descriptionResult = await describeAndEmbedImage({ s3Key, mimetype: mimeType });

    const doc = await designRepo.create({
        Name: name,
        UploadedBy: uploadedBy,
        DesignType: designType,
        EnquiryId: enquiryId || null,
        Key: s3Key,
        Description: descriptionResult?.description || '',
        Tags: descriptionResult?.tags || [],
        Category: descriptionResult?.category || '',
        Group: descriptionResult?.group || '',
        Metal: pricingData?.Metal ? (Array.isArray(pricingData.Metal) ? pricingData.Metal : [pricingData.Metal]) : [],
        Stones: pricingData?.Stones || [],
        Embedding: indexEmbedding ? (descriptionResult?.embedding || []) : [],
    });

    return { design: doc, descriptionResult };
};

exports.getDesignById = async (id) => {
    const design = await designRepo.findById(id);
    if (!design) throw Object.assign(new Error('Design not found'), { status: 404 });

    if (design.Key) {
        design.Url = await generatePresignedUrl(design.Key);
    }

    return design;
};

exports.lookup = async ({ buffer, mimeType, search, designType, category, skip, limit }) => {
    designType = designType?.toLowerCase();
    if (buffer) {
        const embedding = await generateEmbedding(buffer, mimeType);
        return await vectorSearchDesigns({ embedding, designType, category, skip, limit });
    }

    if (search || designType || category) {
        return await filterDesigns({ search, designType, category, skip, limit });
    }

    return await filterDesigns({ skip, limit });
};

async function vectorSearchDesigns({ embedding, designType, category, skip = 0, limit = 10 }) {
    const filter = {};
    if (designType) filter.DesignType = designType.toLowerCase();
    if (category) filter.Category = category;

    const results = await findSimilar({
        embedding,
        limit: skip + limit,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        skipEnquiryLookup: true,
    });

    const pagedResults = results.slice(skip, skip + limit);

    const images = await Promise.all(pagedResults.map(async (r) => {
        const url = r.Key ? await generatePresignedUrl(r.Key) : null;
        return { Url: url, Name: r.Name || '', designId: r._id };
    }));

    return { images, total: images.length, skip, limit };
}

async function filterDesigns({search, designType, category, skip = 0, limit = 10 }) {
    const match = {};
    if (search) match.$or = [
        { Description: { $regex: search, $options: 'i' } },
        { Tags: { $regex: search, $options: 'i' } },
    ];

    if (designType) match.DesignType = designType; // already lowercased by lookup
    if (category) match.Category = category;

    const [results, total] = await Promise.all([
        designRepo.find(match, { Name: 1, Key: 1, Category: 1, Description: 1 }, { sort: { CreatedAt: -1 }, skip, limit }),
        designRepo.countDocuments(match),
    ]);

    const images = await Promise.all(results.map(async (d) => {
        const url = d.Key ? await generatePresignedUrl(d.Key) : null;
        return {
            Url: url,
            Name: d.Name || '',
            Category: d.Category || '',
            Description: d.Description || '',
            designId: d._id,
        };
    }));

    return { images, total, skip, limit };
}
