const sharp = require('sharp');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { calculatePricing } = require('./pricing.service');
const { createConcurrencyLimiter } = require('../utils/concurrency');
const stoneMaster = require('../data/stoneMaster.json');

const MAX_CONCURRENT_PRICING = 3;
const CT_TOLERANCE = 0.02;
const WEIGHT_TOLERANCE = 0.0006;

const runPricingLimited = createConcurrencyLimiter(MAX_CONCURRENT_PRICING);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const stoneItemSchema = {
    type: SchemaType.OBJECT,
    properties: {
        Color: {
            type: SchemaType.STRING,
            nullable: true
        },
        Shape: {
            type: SchemaType.STRING,
            nullable: true
        },
        MmSize: {
            type: SchemaType.STRING,
            nullable: true
        },
        SieveSize: {
            type: SchemaType.STRING,
            nullable: true
        },
        Weight: {
            type: SchemaType.NUMBER,
            nullable: true
        },
        Pcs: {
            type: SchemaType.NUMBER,
            nullable: true
        },
        CtWeight: {
            type: SchemaType.NUMBER,
            nullable: true
        }
    },
    required: [
        'Color',
        'Shape',
        'MmSize',
        'SieveSize',
        'Weight',
        'Pcs',
        'CtWeight'
    ]
};

const extractionSchema = {
    type: SchemaType.OBJECT,
    properties: {
        Stones: {
            type: SchemaType.ARRAY,
            items: stoneItemSchema
        },
        Metal: {
            type: SchemaType.OBJECT,
            properties: {
                Weight: {
                    type: SchemaType.NUMBER,
                    nullable: true
                },
                Quality: {
                    type: SchemaType.STRING,
                    nullable: true
                }
            }
        }
    },
    required: ['Stones', 'Metal']
};

const SYSTEM_INSTRUCTION = `
You are a high-precision jewelry table transcription engine.

Extract the Diamond Specification Table exactly as visible.

Columns:
DIA/COL
ST SHAPE
SIEVE SIZE
MM SIZE
AVRG WT
PCS
CT WT

Extract every visible row exactly once.
Preserve all values exactly as printed.
Preserve decimals exactly.
Never calculate missing values.
Never estimate unreadable values.
Never merge rows.
Never split rows.
Return null when a value cannot be read reliably.
Extract metal weight and quality only when visible.
Return only the required JSON.
`;

const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION
});

async function cropByFractions(buffer, crop) {
    if (!crop) return buffer;

    const {
        x = 0,
        y = 0,
        w = 1,
        h = 1
    } = crop;

    if (
        !(x > 0) &&
        !(y > 0) &&
        !(w < 1) &&
        !(h < 1)
    ) {
        return buffer;
    }

    const meta = await sharp(buffer)
        .rotate()
        .metadata();

    const W = meta.width;
    const H = meta.height;

    if (!W || !H) {
        return buffer;
    }

    const left = Math.max(
        0,
        Math.min(
            W - 1,
            Math.round(x * W)
        )
    );

    const top = Math.max(
        0,
        Math.min(
            H - 1,
            Math.round(y * H)
        )
    );

    const width = Math.max(
        1,
        Math.min(
            W - left,
            Math.round(w * W)
        )
    );

    const height = Math.max(
        1,
        Math.min(
            H - top,
            Math.round(h * H)
        )
    );

    return sharp(buffer)
        .rotate()
        .extract({
            left,
            top,
            width,
            height
        })
        .toBuffer();
}

function normalizeMm(value) {
    if (value == null) {
        return null;
    }

    const match = String(value)
        .replace(/\s+/g, '')
        .match(/\d+(?:\.\d+)?/);

    if (!match) {
        return null;
    }

    return Number(match[0]).toFixed(2);
}

function normalizeSieve(value) {
    if (value == null) {
        return null;
    }

    return String(value)
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/CRD/g, '')
        .trim();
}

function validateMath(row) {
    if (
        row.Pcs == null ||
        row.Weight == null ||
        row.CtWeight == null
    ) {
        return false;
    }

    const pcs = Number(row.Pcs);
    const weight = Number(row.Weight);
    const ctWeight = Number(row.CtWeight);

    if (
        !Number.isInteger(pcs) ||
        pcs < 0
    ) {
        return false;
    }

    if (
        !Number.isFinite(weight) ||
        weight < 0
    ) {
        return false;
    }

    if (
        !Number.isFinite(ctWeight) ||
        ctWeight < 0
    ) {
        return false;
    }

    return Math.abs(
        (pcs * weight) - ctWeight
    ) < CT_TOLERANCE;
}

function validateMaster(row) {
    const mm = normalizeMm(row.MmSize);

    if (!mm) {
        return {
            masterFound: false,
            mmValid: false,
            sieveValid: false,
            weightValid: false
        };
    }

    const master = stoneMaster[mm];

    if (!master) {
        return {
            masterFound: false,
            mmValid: false,
            sieveValid: false,
            weightValid: false
        };
    }

    const extractedSieve =
        normalizeSieve(row.SieveSize);

    const sieveValid =
        master.sieveSizes.some(
            sieve =>
                normalizeSieve(sieve) ===
                extractedSieve
        );

    const weight = Number(row.Weight);

    const weightValid =
        Number.isFinite(weight) &&
        master.avgWeights.some(
            avg =>
                Math.abs(
                    Number(avg) - weight
                ) <= WEIGHT_TOLERANCE
        );

    return {
        masterFound: true,
        mmValid: true,
        sieveValid,
        weightValid
    };
}

function validateStoneRow(row) {
    const master =
        validateMaster(row);

    const mathValid =
        validateMath(row);

    const valid =
        master.masterFound &&
        master.mmValid &&
        master.sieveValid &&
        master.weightValid &&
        mathValid;

    return {
        ...row,
        Valid: valid,
        Validation: {
            MmSize: master.mmValid,
            SieveSize: master.sieveValid,
            AvgWeight: master.weightValid,
            CtWeight: mathValid
        }
    };
}

function calculateTotalPieces(stones) {
    return stones.reduce(
        (total, stone) => {
            const pcs =
                Number(stone.Pcs);

            if (
                !Number.isInteger(pcs) ||
                pcs < 0
            ) {
                return total;
            }

            return total + pcs;
        },
        0
    );
}

async function extractPricingDataFromImage(
    imageBuffer,
    mimeType
) {
    const base64 =
        imageBuffer.toString('base64');

    const response =
        await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: 'Extract the visible jewelry table exactly into the required JSON schema.'
                        },
                        {
                            inlineData: {
                                mimeType,
                                data: base64
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0,
                responseMimeType:
                    'application/json',
                responseSchema:
                    extractionSchema
            }
        });

    const extracted =
        JSON.parse(
            response.response.text()
        );

    const stones =
        (extracted.Stones || [])
            .map(validateStoneRow);

    return {
        Stones: stones,
        Metal:
            extracted.Metal || {
                Weight: null,
                Quality: null
            },
        TotalPieces:
            calculateTotalPieces(stones)
    };
}

function validateExtracted(data) {
    if (
        !data ||
        typeof data !== 'object'
    ) {
        throw new Error(
            'LLM returned invalid data'
        );
    }

    if (!Array.isArray(data.Stones)) {
        throw new Error(
            'LLM response missing Stones array'
        );
    }

    if (
        !data.Metal ||
        typeof data.Metal !== 'object'
    ) {
        throw new Error(
            'LLM response missing Metal object'
        );
    }

    return data;
}

exports.extractPricingDataFromImage =
    extractPricingDataFromImage;

exports.extractAndPrice =
runPricingLimited(async ({
    imageBuffer,
    mimeType,
    clientId,
    stoneType,
    quantity,
    metalQuality,
    crop
}) => {
    let workingBuffer =
        await cropByFractions(
            imageBuffer,
            crop
        );

    imageBuffer = null;

    const extracted =
        validateExtracted(
            await extractPricingDataFromImage(
                workingBuffer,
                mimeType
            )
        );

    workingBuffer = null;

    const invalidRows =
        extracted.Stones.filter(
            stone => !stone.Valid
        );

    if (invalidRows.length) {
        const error =
            new Error(
                'Stone validation failed'
            );

        error.code =
            'STONE_VALIDATION_FAILED';

        error.invalidRows =
            invalidRows;

        throw error;
    }

    const resolvedMetalQuality =
        metalQuality ||
        extracted.Metal?.Quality ||
        null;

    const pricingDetails = {
        Metal: {
            Weight:
                extracted.Metal?.Weight ??
                null,
            Quality:
                resolvedMetalQuality
        },

        Quantity:
            quantity || 1,

        Stones:
            extracted.Stones.map(
                stone => ({
                    Color: stone.Color,
                    Shape: stone.Shape,
                    MmSize: stone.MmSize,
                    SieveSize:
                        stone.SieveSize,
                    Weight:
                        stone.Weight,
                    Pcs:
                        stone.Pcs,
                    CtWeight:
                        stone.CtWeight,
                    Type:
                        stoneType || '',
                    Markup: 0
                })
            ),

        TotalPieces:
            extracted.TotalPieces
    };

    const pricing =
        await calculatePricing(
            pricingDetails,
            clientId
        );

    return {
        extractedData: extracted,
        pricing
    };
});