const OpenAI = require('openai');
const { generatePresignedUrl } = require('../utils/s3');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_PROMPT = `You are a jewellery expert analysing a reference image for a manufacturing studio.
Extract every detail a designer would need to identify, classify, or recreate this piece.
Return ONLY a JSON object with no markdown or commentary:
{
  "description": "<detailed paragraph covering: jewellery type (ring/pendant/bracelet/earring/etc.), metal colour and quality if visible (yellow gold/white gold/rose gold/platinum/silver), setting style (prong/bezel/pavé/channel/flush/tension/halo/cluster/etc.), stone types and colours, approximate stone sizes or carat weight if visible, estimated metal weight range if inferable, dimensions or proportions (band width, overall size, height), design style (solitaire/three-stone/eternity/cocktail/vintage/minimalist/bold/geometric/floral/filigree/etc.), surface finish (polished/matte/hammered/engraved), any stampings or hallmarks visible, and any other distinctive features>",
  "tags": ["<8-15 short searchable tags — include jewellery type, metal colour, setting style, stone type, design style, finish, and any notable techniques like 'filigree', 'milgrain', 'rhodium plated', 'hand engraved', etc.>"],
  "group": "<classify the design style into exactly one of: Bridal | Hip-hop | Cuban. Bridal = delicate, floral, romantic, engagement/wedding pieces. Hip-hop = bold, iced-out, statement pieces with heavy stone coverage. Cuban = link chains, thick metal, street/luxury aesthetic. Pick the closest match.>",
  "category": "<jewellery type as exactly one of: Ring | Pendant | Bracelet | Earring | Necklace | Bangle | Chain | Brooch | Anklet | Other>"
}
If a measurement, weight, or dimension is clearly visible or can be reasonably estimated from the image, include it.
If a detail is not visible, omit it rather than guess.`;

// Tolerates markdown-fenced JSON or surrounding prose; returns null on failure.
const safeParseJson = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(cleaned); } catch { /* try slice */ }
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
};

/**
 * Describe an image with GPT-4o vision and embed the description.
 * Returns null if the file isn't an image.
 *
 * @param {{ s3Key: string, mimetype?: string }} input
 * @returns {Promise<{description: string, tags: string[], embedding: number[]} | null>}
 */
exports.describeAndEmbedImage = async ({ s3Key, mimetype }) => {
    if (mimetype && !mimetype.startsWith('image/')) return null;

    const url = await generatePresignedUrl(s3Key, 'inline');

    const visionRes = await openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: VISION_PROMPT },
                    { type: 'image_url', image_url: { url } },
                ],
            },
        ],
    });

    const message = visionRes.choices?.[0]?.message;
    const rawContent = message?.content ?? '';

    if (message?.refusal) {
        console.warn(`[vision] model refused for ${s3Key}: ${message.refusal}`);
        return null;
    }

    const parsed = safeParseJson(rawContent);
    if (!parsed) {
        console.warn(`[vision] non-JSON response for ${s3Key}. Raw: ${rawContent.slice(0, 500)}`);
        return null;
    }

    const description = String(parsed.description || '').trim();
    const tags        = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    const group       = String(parsed.group    || '').trim();
    const category    = String(parsed.category || '').trim();

    if (!description) return null;

    const embedRes = await openai.embeddings.create({
        model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
        input: description,
    });

    return {
        description,
        tags,
        embedding: embedRes.data[0].embedding,
        group,
        category,
    };
};
