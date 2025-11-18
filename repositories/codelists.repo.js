const Codelist = require('../models/codelists.model');

exports.getCodelistByName = async (name) => {
    if (!name || typeof name !== 'string') {
        throw new Error('Codelist name must be provided as a string.');
    }

    try {
        const codelistDoc = await Codelist.findOne(
            { Type: name },
            { Values: 1, _id: 0 } // Projection: Only return the 'Values' array
        );
        console.log("Codelist document:", codelistDoc);
        // 3. Return the array of values, or null/undefined if not found
        // The result of findOne will be { Values: [...] } or null.
        return codelistDoc ? codelistDoc.Values : null;

    } catch (err) {
        console.error(`Error fetching codelist ${name}:`, err);
        throw new Error('Database error fetching codelist.');
    }
}