const express = require('express');
const router = express.Router();
const controller = require('../controllers/codelists.controller');

// GET codelist by name
router.get('/:name', controller.getCodelistByName);

module.exports = router;

