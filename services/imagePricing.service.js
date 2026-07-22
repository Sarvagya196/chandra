const { calculatePricing } = require('./pricing.service');
const { preprocessImage, extractTableWithTesseract, reconcileWithGemini, validateAndRetryRows } = require('./ocr.service');

async function extractPricingDataFromImage(imageBuffer, mimeType) {
    const preprocessed = await preprocessImage(imageBuffer);
    const preprocessedBase64 = preprocessed.toString('base64');

    const ocrText = await extractTableWithTesseract(preprocessed);
    console.log(`[ocr] Raw OCR text:\n${ocrText}`);

    const finalData = await reconcileWithGemini(preprocessedBase64, ocrText, mimeType);
    finalData.Stones = finalData.Stones || [];

    finalData.Stones = await validateAndRetryRows(finalData.Stones, preprocessedBase64, mimeType);

    return finalData;
}

exports.extractPricingDataFromImage = extractPricingDataFromImage;

function validateExtracted(data) {
    if (!data || typeof data !== 'object') throw new Error('LLM returned invalid data');
    if (!Array.isArray(data.Stones)) throw new Error('LLM response missing Stones array');
    if (!data.Metal || typeof data.Metal !== 'object') throw new Error('LLM response missing Metal object');
    return data;
}

exports.extractAndPrice = async ({ imageBuffer, mimeType, clientId, stoneType, quantity, metalQuality }) => {
    const extracted = validateExtracted(await extractPricingDataFromImage(imageBuffer, mimeType));

    const resolvedMetalQuality = metalQuality || extracted.Metal?.Quality || null;

    const pricingDetails = {
        Metal: {
            Weight: extracted.Metal?.Weight || null,
            Quality: resolvedMetalQuality,
        },
        Quantity: quantity || 1,
        Stones: (extracted.Stones || []).map(stone => ({
            ...stone,
            Type: stoneType || '',
            Markup: 0,
        })),
        TotalPieces: extracted.TotalPieces || 0,
    };

    const pricing = await calculatePricing(pricingDetails, clientId);

    return { extractedData: extracted, pricing };
};
