const service = require('../services/codelists.service');

exports.getCodelistByName = async (req, res) => {
    try {
        const codelist = await service.getCodelistByName(req.params.name);
        res.json(codelist);
    } catch (error) {
        console.error("Error fetching codelist by name:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};