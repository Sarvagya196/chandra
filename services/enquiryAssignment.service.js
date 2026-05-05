const OpenAI = require('openai');
const userService = require('./user.service');
const codelistsService = require('./codelists.service');
const notificationService = require('./notifications.service');
const repo = require('../repositories/enquiry.repo');
const { describeAndEmbedImage } = require('./imageDescribe.service');
const { indexDesign, findSimilar } = require('./designSimilarity.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STATUS_TO_ROLE_CODE = {
    'Coral': 'CO',
    'Cad': 'CD',
    'Approved Cad': 'CD',
};

async function resolveRoleId(roleCode) {
    const roles = await codelistsService.getCodelistByName('Roles');
    return roles?.find(r => r.Code === roleCode)?.Id;
}

/**
 * Pick the best designer using a single LLM ranking call.
 * Returns the chosen userId (string) or null if no candidate could be picked.
 */
async function rankDesigner({ designers, referenceTags, referenceDescription }) {
    if (!designers || designers.length === 0) return null;
    if (designers.length === 1) return String(designers[0]._id);

    const payload = {
        designers: designers.map(d => ({ id: String(d._id), name: d.name, skills: d.skills || '' })),
        referenceTags,
        referenceDescription,
    };

    const res = await openai.chat.completions.create({
        model: process.env.OPENAI_RANK_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: `You are matching a jewellery enquiry to the best designer based on their skills.
Return ONLY a JSON object: { "chosenId": "<designer id>", "reason": "<short reason>" }.
If skills are sparse or absent, pick the first designer.`,
            },
            { role: 'user', content: JSON.stringify(payload) },
        ],
    });

    try {
        const parsed = JSON.parse(res.choices[0].message.content);
        const chosen = String(parsed.chosenId || '');
        if (designers.some(d => String(d._id) === chosen)) return chosen;
    } catch {
        /* fall through */
    }
    return String(designers[0]._id);
}

/**
 * Auto-assign a Coral or Cad designer based on the reference image descriptions.
 * Best-effort — caller should not let exceptions propagate.
 */
exports.autoAssignDesigner = async ({ enquiry, referenceDescription, referenceTags }) => {
    const currentStatus = enquiry.StatusHistory?.at(-1)?.Status;
    const roleCode = STATUS_TO_ROLE_CODE[currentStatus];
    if (!roleCode) return null;

    const roleId = await resolveRoleId(roleCode);
    if (!roleId) return null;

    const designers = await userService.getUsersByRoleFull(roleId);
    const chosenId = await rankDesigner({ designers, referenceTags, referenceDescription });
    if (!chosenId) return null;

    const statusEntry = {
        Status: currentStatus,
        Timestamp: new Date(),
        AssignedTo: chosenId,
        AddedBy: 'System (auto-assign)',
        Details: 'Auto-assigned based on reference imagery and designer skills',
    };
    enquiry.StatusHistory.push(statusEntry);
    await repo.updateEnquiry(enquiry._id, { StatusHistory: enquiry.StatusHistory });

    try {
        await notificationService.createAlertsForUsers(
            [chosenId],
            '🎨 New Enquiry Assigned',
            `You've been assigned enquiry "${enquiry.Name}".`,
            'enquiry_assigned',
            `enquiries/${enquiry._id.toString()}`
        );
    } catch (err) {
        console.error('[auto-assign] notification failed:', err);
    }

    return chosenId;
};

/**
 * Orchestrator: runs after enquiry is created with reference images.
 * Best-effort — every block try/catches.
 */
exports.postEnquiryCreateHook = async (enquiry) => {
    const refs = enquiry.ReferenceImages || [];
    if (refs.length === 0) return;

    const enriched = []; // { description, tags, embedding } per image

    for (const ref of refs) {
        try {
            const result = await describeAndEmbedImage({ s3Key: ref.Key, mimetype: ref.MimeType });
            if (!result) continue;
            enriched.push(result);

            try {
                await indexDesign({
                    enquiryId: enquiry._id,
                    type: 'reference',
                    version: null,
                    key: ref.Key,
                    description: result.description,
                    tags: result.tags,
                    embedding: result.embedding,
                });
            } catch (err) {
                console.error('[post-create] indexDesign failed for ref', ref.Key, err);
            }
        } catch (err) {
            console.error('[post-create] describeAndEmbedImage failed for ref', ref.Key, err);
        }
    }

    if (enriched.length === 0) return;

    // Auto-assign designer using the combined description + tags
    try {
        const combinedDescription = enriched.map(e => e.description).join('\n\n');
        const combinedTags = [...new Set(enriched.flatMap(e => e.tags))];
        await exports.autoAssignDesigner({
            enquiry,
            referenceDescription: combinedDescription,
            referenceTags: combinedTags,
        });
    } catch (err) {
        console.error('[post-create] autoAssignDesigner failed:', err);
    }

    // Find similar past designs across all reference embeddings, dedupe by EnquiryId
    try {
        const seen = new Map(); // EnquiryId -> match
        for (const e of enriched) {
            const matches = await findSimilar({
                embedding: e.embedding,
                limit: 5,
                excludeEnquiryId: enquiry._id,
            });
            for (const m of matches) {
                const key = String(m.EnquiryId);
                const prev = seen.get(key);
                if (!prev || m.score > prev.score) seen.set(key, m);
            }
        }
        const top = Array.from(seen.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(m => ({ EnquiryId: m.EnquiryId, Key: m.Key, Score: m.score }));

        if (top.length > 0) {
            await repo.updateEnquiry(enquiry._id, { SimilarDesigns: top });
        }
    } catch (err) {
        console.error('[post-create] findSimilar failed:', err);
    }
};
