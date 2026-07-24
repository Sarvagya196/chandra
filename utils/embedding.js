async function generateEmbedding(buffer, mimeType) {
    const embedModel = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-2';
    const base64 = buffer.toString('base64');
    const embedUrl = `https://generativelanguage.googleapis.com/v1/models/${embedModel}:embedContent?key=${process.env.GEMINI_API_KEY}`;

    const resp = await fetch(embedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${embedModel}`,
            content: {
                parts: [{ inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } }],
            },
            outputDimensionality: 1536,
        }),
    });

    if (!resp.ok) {
        throw new Error(`Embedding API error ${resp.status}: ${await resp.text()}`);
    }

    const data = await resp.json();
    return data.embedding.values;
}

module.exports = { generateEmbedding };
