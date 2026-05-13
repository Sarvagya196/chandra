const OpenAI = require('openai');
const enquiryService = require('./enquiry.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert jewelry QA reviewer.

You are given:
1. A jewelry image
2. A textual description of the jewelry

Your task:
Compare the image against the description and identify mismatches, missing elements, or inconsistencies.

Focus on:
- Metal color (white/yellow/rose)
- Stone shapes and types
- Presence of engraving (only if mentioned in description)
- Overall design consistency
- Any obvious missing elements from description

Output STRICT JSON:
{
  "summary": "A short paragraph summarizing mismatches or confirming alignment",
  "issues": ["bullet point 1", "bullet point 2"], All bullet points in the issues array should be specific and directly supported by the image-description comparison. Do NOT include speculative issues that cannot be confidently identified from the image.
  bullet point should be in english and bengali
  "confidence": "high | medium | low"
}

Rules:
- Be conservative: if unsure, say "might be" or "unclear"
- Do NOT hallucinate details not visible
- Do NOT output anything outside JSON`;

function buildDescription(enquiry) {
    const parts = [];

    if (enquiry.Category) parts.push(`Category: ${enquiry.Category}`);

    const metalQuality = enquiry.Metal?.Quality;
    const metalColor = enquiry.Metal?.Color;
    if (metalQuality || metalColor) {
        parts.push(`Metal: ${[metalColor, metalQuality].filter(Boolean).join(' ')}`);
    }

    if (enquiry.StoneType) parts.push(`Stone type: ${enquiry.StoneType}`);
    if (enquiry.Remarks) parts.push(`Remarks: ${enquiry.Remarks.trim()}`);
    if (enquiry.SpecialRemarks) parts.push(`Special remarks: ${enquiry.SpecialRemarks.trim()}`);

    return parts.join('\n');
}

function validateLLMResponse(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('LLM response is not an object');
    if (typeof parsed.summary !== 'string') throw new Error('Missing summary');
    if (!Array.isArray(parsed.issues)) throw new Error('Missing issues array');
    if (!['high', 'medium', 'low'].includes(parsed.confidence)) throw new Error('Invalid confidence value');
    return parsed;
}

async function callLLM(imageBuffer, mimeType, description) {
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: `Jewelry description:\n${description}` },
                    { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
                ]
            }
        ],
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
}

exports.validateImage = async (enquiryId, imageBuffer, mimeType) => {
    const enquiry = await enquiryService.getEnquiry(enquiryId);
    if (!enquiry) throw Object.assign(new Error('Enquiry not found'), { status: 404 });

    const description = buildDescription(enquiry);
    if (!description) throw Object.assign(new Error('Enquiry has no usable description'), { status: 400 });

    let parsed;
    try {
        parsed = await callLLM(imageBuffer, mimeType, description);
    } catch {
        parsed = await callLLM(imageBuffer, mimeType, description);
    }

    return validateLLMResponse(parsed);
};
