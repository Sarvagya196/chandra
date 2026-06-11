const { GoogleGenerativeAI } = require('@google/generative-ai');
const clientService = require('./client.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `You are an expert jewellery production assistant writing a designer-facing brief.

You will be given an INPUT DOSSIER listing every populated field from a jewellery enquiry. Your job is to turn that dossier into a single Markdown document that a layman workshop designer can read in seconds and immediately know what to make.

OUTPUT FORMAT (Markdown):
- Start with a one-line **headline** in bold that names the piece and the client (e.g. **18K White Gold Diamond Ring for ABC Jewellers**).
- Then a short "Key Specs" block as a bullet list with the headline specs in **bold labels**:
    - **Metal:** ...
    - **Stone:** ...
    - **Size / Weight:** ...
    - **Quantity:** ...
    - **Priority / Delivery:** ...
  Only include bullets for fields that are actually present in the dossier — do not invent "N/A" rows.
- Then a "Customer Requirements" section as a bulleted list, parsing the customer's Remarks and Special Remarks into discrete, plain-English points (engraving text, finish, sizing, components, findings, etc.).
- Then an "Other Notes" section as a bulleted list for ANY field from the dossier that did not fit naturally into the sections above (Budget, Stamping, Style Number, GATI Order Number, etc.).

HARD RULES — COMPLETENESS:
- The Markdown output MUST mention every field that appears in the INPUT DOSSIER. If a field is in the dossier, it must appear in the summary — either inlined into a sentence or in the "Other Notes" bullet list.
- Do not omit, merge, or drop any field. If you are unsure where a field belongs, put it under "Other Notes".
- Do NOT invent details. Only use values from the dossier.
- Do NOT use field names like "StoneType" or "MetalWeight" in the prose — use natural English ("stone type", "metal weight").
- Be plain, direct, and short. No fluff, no marketing language. Aim for clarity over completeness of prose — but never at the cost of dropping a field.
- Output ONLY the Markdown. No preamble, no closing remarks, no code fences.`;

const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
});

function hasValue(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
}

function formatWeightRange(weight) {
    if (!weight || typeof weight !== 'object') return null;
    if (hasValue(weight.Exact)) return `exactly ${weight.Exact}`;
    const from = hasValue(weight.From) ? weight.From : null;
    const to = hasValue(weight.To) ? weight.To : null;
    if (from !== null && to !== null) return `${from} – ${to}`;
    if (from !== null) return `from ${from}`;
    if (to !== null) return `up to ${to}`;
    return null;
}

function formatDate(d) {
    if (!d) return null;
    const date = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
}

async function buildDossier(enquiry) {
    const lines = [];

    let clientName = null;
    if (hasValue(enquiry.ClientId)) {
        try {
            const client = await clientService.getClient(enquiry.ClientId);
            if (client?.Name) clientName = client.Name;
        } catch (err) {
            console.error('[summaryGeneration] client lookup failed:', err);
        }
    }
    if (clientName) lines.push(`Client: ${clientName}`);

    if (hasValue(enquiry.Name))            lines.push(`Enquiry Name: ${enquiry.Name}`);
    if (hasValue(enquiry.StyleNumber))     lines.push(`Style Number: ${enquiry.StyleNumber}`);
    if (hasValue(enquiry.GatiOrderNumber)) lines.push(`GATI Order Number: ${enquiry.GatiOrderNumber}`);
    if (hasValue(enquiry.Category))        lines.push(`Category: ${enquiry.Category}`);
    if (hasValue(enquiry.Quantity))        lines.push(`Quantity: ${enquiry.Quantity}`);
    if (hasValue(enquiry.Priority))        lines.push(`Priority: ${enquiry.Priority}`);

    const metalColor = enquiry.Metal?.Color;
    const metalQuality = enquiry.Metal?.Quality;
    if (hasValue(metalColor))   lines.push(`Metal Colour: ${metalColor}`);
    if (hasValue(metalQuality)) lines.push(`Metal Quality: ${metalQuality}`);

    if (hasValue(enquiry.StoneType)) lines.push(`Stone Type: ${enquiry.StoneType}`);
    if (hasValue(enquiry.Stamping))  lines.push(`Stamping: ${enquiry.Stamping}`);

    const metalWeight = formatWeightRange(enquiry.MetalWeight);
    if (metalWeight) lines.push(`Metal Weight (grams): ${metalWeight}`);

    const diamondWeight = formatWeightRange(enquiry.DiamondWeight);
    if (diamondWeight) lines.push(`Diamond Weight (carats): ${diamondWeight}`);

    if (hasValue(enquiry.Budget)) lines.push(`Budget: ${enquiry.Budget}`);

    const shippingDate = formatDate(enquiry.ShippingDate);
    if (shippingDate) lines.push(`Shipping / Delivery Date: ${shippingDate}`);

    if (hasValue(enquiry.Remarks))        lines.push(`Customer Remarks: ${enquiry.Remarks.trim()}`);
    if (hasValue(enquiry.SpecialRemarks)) lines.push(`Special Remarks: ${enquiry.SpecialRemarks.trim()}`);

    return lines.join('\n');
}

exports.generateSummary = async (enquiry) => {
    if (!enquiry) return null;

    const dossier = await buildDossier(enquiry);
    if (!dossier) return null;

    try {
        const response = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: `INPUT DOSSIER\n\n${dossier}` }],
            }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'text/plain',
            },
        });

        const text = response.response.text();
        return text && text.trim() ? text.trim() : null;
    } catch (err) {
        console.error('[generateSummary] Gemini generation failed:', err);
        return null;
    }
};
