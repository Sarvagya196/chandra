const repo = require('../repositories/codelists.repo');

exports.getCodelistByName = async (name) => {
    try {
        return await repo.getCodelistByName(name);
    } catch (error) {
        console.error("Error fetching codelist by name:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};