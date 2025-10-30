const express = require('express');
const router = express.Router();
const controller = require('../controllers/enquiry.controller');
const authenticateToken = require('../middleware/authenticateToken');
const dynamicUpload = require('../middleware/dynamicUpload');

// GET all enquiries
router.get('/', authenticateToken, controller.getEnquiries);

// GET enquiry by id
router.get('/:id', authenticateToken, controller.getEnquiryById);

// GET enquiries by clientId
router.get('/client/:clientId', authenticateToken, controller.getEnquiriesByClientId);

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

router.get('/user/:userId', authenticateToken, controller.getEnquiriesByUserId)

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
