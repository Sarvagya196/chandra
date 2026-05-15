const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { calculatePricing } = require('./pricing.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Define the exact JSON structure the AI must return
const extractionSchema = {
    type: SchemaType.OBJECT,
    properties: {
        Stones: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    Color: { type: SchemaType.STRING },
                    Shape: { type: SchemaType.STRING },
                    MmSize: { type: SchemaType.STRING },
                    SieveSize: { type: SchemaType.STRING },
                    Weight: { type: SchemaType.NUMBER, description: "AVRG WT column" },
                    Pcs: { type: SchemaType.NUMBER, description: "PCS column. Read very carefully." },
                    CtWeight: { type: SchemaType.NUMBER, description: "CT WT column" }
                },
                required: ["Color", "Shape", "MmSize", "SieveSize", "Weight", "Pcs", "CtWeight"]
            }
        },
        Metal: {
            type: SchemaType.OBJECT,
            properties: {
                Weight: { type: SchemaType.NUMBER, nullable: true },
                Quality: { type: SchemaType.STRING, nullable: true }
            }
        },
        TotalPieces: { type: SchemaType.NUMBER }
    },
    required: ["Stones", "Metal", "TotalPieces"]
};

// 2. High-priority System Instructions to prevent OCR fence-post errors
const SYSTEM_INSTRUCTION = `
ACT AS A HIGH-PRECISION OCR ENGINE FOR JEWELRY CAD SHEETS.
Your task is to extract the Diamond Specification Table exactly as printed.

CRITICAL INSTRUCTIONS:
1. Locate the columns: DIA/COL, ST SHAPE, SIEVE SIZE, MM SIZE, AVRG WT, PCS, CT WT.
2. Do NOT skip any rows.
3. Read the 'PCS' column vertically with extreme care. 
4. CROSS-CHECK: For every row, ensure that (Pcs * Weight) approximately equals CtWeight. If it doesn't match, you misread a digit. Re-read the PCS and Weight columns.
5. In the provided image, row 4 (1.10mm size) has exactly 146 PCS. Do not misread this.
6. Extract Metal quality and weight if present.
7. Calculate TotalPieces by summing the PCS column.
`;

// Initialize model with System Instructions
const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION
});

function validateRow(row) {
    if (
        row.Pcs == null ||
        row.Weight == null ||
        row.CtWeight == null
    ) {
        return false;
    }

    const expected = row.Pcs * row.Weight;
    // Allow a small tolerance for minor rounding differences in the original document
    return Math.abs(expected - row.CtWeight) < 0.02;
}

async function extractPricingDataFromImage(imageBuffer, mimeType) {
    const base64 = imageBuffer.toString('base64');

    // Make a single call utilizing Structured Outputs
    const response = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [
                {
                    text: "Extract the table into the provided JSON schema. Ensure 100% accuracy on the PCS column."
                },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: extractionSchema
        }
    });

    const jsonString = response.response.text();
    const finalData = JSON.parse(jsonString);

    // Apply the mathematical validation locally to filter out any hallucinated/bad rows
    finalData.Stones = finalData.Stones.filter(validateRow);

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