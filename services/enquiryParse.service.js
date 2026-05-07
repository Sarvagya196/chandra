const OpenAI = require('openai');
const clientService = require('./client.service');
const codelistsService = require('./codelists.service');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Required fields per media type ─────────────────────────────────────────
// These are the fields that MUST be populated; anything missing becomes a missingField entry.
const REQUIRED_BY_STATUS = {
    coral:        ['Name', 'ClientId', 'Category', 'Priority', 'Metal.Color', 'Remarks'],
    cad:          ['Name', 'ClientId', 'Category', 'Priority', 'Metal.Color', 'Metal.Quality', 'StoneType', 'Remarks'],
    approved_cad: ['Name', 'ClientId', 'Category', 'Priority', 'Metal.Color', 'Metal.Quality', 'StoneType', 'Remarks'],
};

// ─── Static option lists ─────────────────────────────────────────────────────
const CATEGORY_OPTIONS = ['Ring', 'Bracelet', 'Necklace', 'Earrings', 'Pendant', 'Bangle', 'Other'];
const PRIORITY_OPTIONS  = ['Medium', 'High', 'Super High'];
const METAL_COLOR_OPTIONS   = ['Yellow Gold', 'White Gold', 'Rose Gold', 'Two Tone Rose White Gold', 'Two Tone Yellow White Gold'];
const METAL_QUALITY_OPTIONS = ['10K', '14K', '18K', '22K', '24K', 'Silver 925', 'Platinum'];

// Human-readable labels for each field path
const FIELD_LABELS = {
    'Name':         'Enquiry Name',
    'ClientId':     'Client',
    'Category':     'Category',
    'Priority':     'Priority',
    'Metal.Color':  'Metal Colour',
    'Metal.Quality':'Metal Quality',
    'StoneType':    'Stone Type',
    'Remarks':      'Remarks',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getNestedValue(obj, dotPath) {
    return dotPath.split('.').reduce((acc, key) => (acc != null ? acc[key] : null), obj);
}

function isMissing(value) {
    return value === null || value === undefined || value === '';
}

function toOptions(items, labelKey = 'Name', valueKey = '_id') {
    return items.map(item => ({ label: item[labelKey], value: String(item[valueKey]) }));
}

// ─── Build missingFields from parsed result ───────────────────────────────────
function buildMissingFields(parsed, requiredFields, optionsMap) {
    const missing = [];
    for (const field of requiredFields) {
        if (isMissing(getNestedValue(parsed, field))) {
            missing.push({
                field,
                label: FIELD_LABELS[field] || field,
                options: optionsMap[field] || [],
            });
        }
    }
    return missing;
}

// ─── Build system prompt (replace placeholder with your actual prompt) ────────
function buildSystemPrompt(clientList, stoneTypeList) {
    const clientJson = JSON.stringify(
        clientList.map(c => ({ id: String(c._id), name: c.Name, priority_order: c.PriorityOrder ?? null }))
    );

    const stoneTypeJson = JSON.stringify(
        stoneTypeList.map(v => ({ id: String(v._id), name: v.Name }))
    );

    return `You are an expert jewellery order assistant. Extract structured enquiry details from the user's message.

Available clients (match by name from the message, return the "id" value as ClientId).
Each client has a priority_order (lower number = higher priority client). Use this as the baseline for the Priority field — a lower priority_order client should default to a higher priority unless the message says otherwise:
${clientJson}

Available stone types (match by name from the message, return the "name" value as StoneType):
${stoneTypeJson}

Return ONLY a valid JSON object with these keys (use null for anything not mentioned):
{
  "Name": "<short Very specific summary of the enquiry Not a generic title, something that can be used to describe it and searchable>",
  "ClientId": "<matched client id or null>",
  "StyleNumber": "<style or design number if mentioned it would be 5 or 6 digits like R45252, E63464, etc. or null>",
  "Quantity": <number or null>,
  "Category": "<Ring|Bracelet|Necklace|Earrings|Pendant|Bangle|Other or null>",
  "Priority": "<Normal|High|Super High — infer from urgency keywords like 'urgent', 'asap', 'fast', 'ship soon' or null>",
  "Budget": "<string or null>",
  "Metal": {
    "Color": "<Yellow Gold|White Gold|Rose Gold|Two Tone Rose White Gold|Two Tone Yellow White Gold| or null>",
    "Quality": "<10K|14K|18K|22K|Silver 925|Platinum or null>"
  },
  "StoneType": "<stone type from message or null>",
  "Stamping": "<string or null>",
  "Remarks": "<copy the exact original message here>",
  "SpecialRemarks": "<any special instructions or additional notes beyond the main request or null>",
  "ShippingDate": "<ISO date string or null> Date cannot be in the past. If the message mentions a date, try to extract it and convert to ISO format. If only a relative time is mentioned (e.g. 'in 2 weeks', 'next month', 'by end of this month'), convert that to an absolute date based on the current date. If no date or time is mentioned, return null."
}

Do not include any explanation or markdown — only the JSON object.`;
}

// ─── Main export ─────────────────────────────────────────────────────────────
exports.parseEnquiryMessage = async ({ message, mediaType }) => {
    const normalizedStatus = (mediaType || 'coral').toLowerCase().replace(/\s+/g, '_');
    const requiredFields = REQUIRED_BY_STATUS[normalizedStatus] || REQUIRED_BY_STATUS.coral;

    // Fetch runtime data in parallel
    const [clients, stoneTypeValues] = await Promise.all([
        clientService.getClients(),
        codelistsService.getCodelistByName('StoneTypes'),
    ]);

    const stoneTypeOptions = stoneTypeValues
        ? stoneTypeValues.map(v => ({ label: v.Name, value: v.Name }))
        : [];

    // Runtime options map keyed by field path
    const optionsMap = {
        'ClientId':      toOptions(clients),
        'Category':      CATEGORY_OPTIONS.map(o => ({ label: o, value: o })),
        'Priority':      PRIORITY_OPTIONS.map(o => ({ label: o, value: o })),
        'Metal.Color':   METAL_COLOR_OPTIONS.map(o => ({ label: o, value: o })),
        'Metal.Quality': METAL_QUALITY_OPTIONS.map(o => ({ label: o, value: o })),
        'StoneType':     stoneTypeOptions,
        'Name':          [],
        'Remarks':       [],
    };

    const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: buildSystemPrompt(clients, stoneTypeValues) },
            { role: 'user', content: message },
        ],
    });

    let parsed;
    try {
        parsed = JSON.parse(completion.choices[0].message.content);
    } catch {
        throw new Error('LLM returned invalid JSON');
    }

    // Remarks always defaults to the original message
    if (isMissing(parsed.Remarks)) {
        parsed.Remarks = message;
    }

    // Attach Status for downstream createEnquiry
    const STATUS_MAP = { coral: 'Coral', cad: 'Cad', approved_cad: 'Approved Cad' };
    parsed.Status = STATUS_MAP[normalizedStatus] || 'Coral';

    const missingFields = buildMissingFields(parsed, requiredFields, optionsMap);

    return { parsed, missingFields };
};
