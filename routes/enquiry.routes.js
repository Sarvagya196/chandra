const express = require('express');
const router = express.Router();
const controller = require('../controllers/enquiry.controller');

// GET all enquiries
router.get('/', controller.getEnquiries);

// POST a new enquiry
router.post('/', controller.createEnquiry);

// PUT update an enquiry by ID
router.put('/:id', controller.updateEnquiry);

module.exports = router;
