const OpenAI = require('openai');
const enquiryService = require('./enquiry.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert jewelry QA reviewer.

You are given:
1. A jewelry image
2. A textual description of the jewelry (general design + a CHECKLIST of customer requirements)

Your task has TWO parts:

PART A — CHECKLIST VERIFICATION (MANDATORY)
For EVERY checklist item provided in the description, you MUST inspect the image and explicitly state whether the item is visible / satisfied / missing / not visually verifiable.
- Include one point per checklist item, even if the answer is "not visually verifiable" (e.g. ring size, length, thickness, delivery date — these cannot be confirmed from an image alone, say so explicitly).
- Each point must name the checklist field and what was (or wasn't) seen.
- Quote the customer's stated value in the point.

PART B — DESIGN CONSISTENCY (regular checks)
Compare the image against the rest of the description (metal colour, stone shape/type, overall design, anything in remarks not already covered by the checklist) and identify mismatches, missing elements, or inconsistencies.
- Focus on metal colour (white/yellow/rose), stone shapes and types, overall design coherence, obvious missing or extra elements.
- Do NOT repeat checklist points here.

Output STRICT JSON in this exact shape:
{
  "summary": "A short paragraph summarising the overall result (alignment or key concerns).",
  "issues": [
    "Checklist Verification - <checklist field> '<customer value>': <what was observed on the image>",
    "Design Consistency - <specific observation tied to the image>"
  ],
  "confidence": "high | medium | low"
}

Formatting rules for each entry in "issues":
- Each entry is ONE plain string, NOT an object.
- Each entry MUST start with one of these two headers followed by " - " (space-hyphen-space):
    "Checklist Verification - ..."  (for every checklist item)
    "Design Consistency - ..."      (for general design observations)
- Include one "Checklist Verification - ..." entry for EVERY checklist item supplied, even if it is not visually verifiable (say so explicitly in that case).
- If there are no design issues, include one entry: "Design Consistency - No issues found".

General rules:
- Each entry must be specific and directly supported by the image. Do NOT speculate about things not visible.
- Be conservative: if unsure, say "might be" or "unclear".
- Do NOT hallucinate details not visible.
- Do NOT output anything outside the JSON.`;

const CHECKLIST_LABELS = {
    Engraving: 'Engraving',
    SizeLength: 'Size - Length',
    SizeRingSize: 'Size - Ring Size',
    DimensionsThickness: 'Dimensions (Thickness)',
    DeliveryDate: 'Delivery Date',
    EnamelPaintwork: 'Enamel / Paintwork',
    RhodiumInstructions: 'Rhodium Instructions',
    Components: 'Components',
    Findings: 'Findings',
};

function buildChecklistLines(checklist) {
    if (!checklist) return [];
    const lines = [];
    for (const [key, label] of Object.entries(CHECKLIST_LABELS)) {
        const value = checklist[key];
        if (value && value !== 'NA' && String(value).trim()) {
            lines.push(`- ${label}: ${String(value).trim()}`);
        }
    }
    return lines;
}

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

    const checklistLines = buildChecklistLines(enquiry.Checklist);
    if (checklistLines.length > 0) {
        parts.push(`CHECKLIST (customer requirements — verify each against the image explicitly):\n${checklistLines.join('\n')}`);
    }

    return parts.join('\n');
}

function validateLLMResponse(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('LLM response is not an object');
    if (typeof parsed.summary !== 'string') throw new Error('Missing summary');
    if (!Array.isArray(parsed.issues)) throw new Error('Missing issues array');
    for (const issue of parsed.issues) {
        if (typeof issue !== 'string') throw new Error('Each issue must be a string');
    }
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
