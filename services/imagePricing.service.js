const OpenAI = require('openai');
const { calculatePricing } = require('./pricing.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert at reading jewelry manufacturing data tables from images.

Extract the following from the image and return STRICT JSON only:

{
  "Stones": [
    {
      "Color": "string (DIA/COL column value, e.g. 'EF', 'GH', 'D')",
      "Shape": "string (ST SHAPE column, e.g. 'RD', 'PR', 'MQ')",
      "MmSize": "string (MM SIZE column value, or empty string if absent)",
      "SieveSize": "string (SIEVE SIZE column value, or empty string if absent)",
      "Weight": "number (AVRG WT column, average weight per stone)",
      "Pcs": "integer (PCS column, number of pieces)",
      "CtWeight": "number (CT WT column, carat weight, 3 decimal places)"
    }
  ],
  "Metal": {
    "Weight": "number (METAL WEIGHT value, e.g. 3.500)",
    "Quality": "string (metal quality visible in image, e.g. '18K', '14K', 'Silver 925', 'Platinum', or null if not found, DONT ADD K'T' ONLY K)"
  },
  "TotalPieces": "integer (sum of all PCS values across all stone rows)"
}

Rules:
- Only include rows that have a Shape value (skip blank/total rows)
- CtWeight must be truncated to 3 decimal places (not rounded)
- If a column is missing or unreadable, use 0 for numbers and empty string for strings
- TotalPieces is the sum of all Pcs values
- Do NOT output anything outside the JSON object`;

async function extractPricingDataFromImage(imageBuffer, mimeType) {
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Extract the jewelry data table from this image.' },
                    { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
                ]
            }
        ],
        response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
}

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
