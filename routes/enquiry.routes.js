const express = require('express');
const router = express.Router();
const controller = require('../controllers/enquiry.controller');
const authenticateToken = require('../middleware/authenticateToken');
const dynamicUpload = require('../middleware/dynamicUpload');

// GET all enquiries
// router.get('/', authenticateToken, controller.getEnquiries);

// Search
router.get('/search', authenticateToken, controller.searchEnquiries);

// Aggregated Counts
router.get('/aggregate', authenticateToken, controller.getAggregatedCounts);

// GET enquiry by id
router.get('/:id', authenticateToken, controller.getEnquiryById);

// GET enquiries by clientId
// router.get('/client/:clientId', authenticateToken, controller.getEnquiriesByClientId);

// POST a new enquiry
router.post('/', authenticateToken, controller.createEnquiry);

// PUT update an enquiry by ID
router.put('/:id', authenticateToken, controller.updateEnquiry);

// DELETE an enquiry by ID
router.delete('/:id', controller.deleteEnquiry);

// Upload assets (coral, cad, reference)
router.post(
    '/:id/upload/:type',
    authenticateToken,  // First middleware: Authentication
    dynamicUpload,      // Second middleware: File upload handling
    controller.uploadAssets // Third middleware: Processing the uploaded files
);

// Mass Actions
router.post(
    '/mass-action',
    authenticateToken,  // First middleware: Authentication
    controller.massActionEnquiries
);


//Update asset details, marking as approved, 
router.put('/:id/upload/:type',
    authenticateToken,
    controller.updateAssets
)

router.post('/pricingCalculate',
    authenticateToken,
    controller.getPricing
)

router.get('/files/:key', authenticateToken, controller.getPresignedFileUrl);

module.exports = router;
