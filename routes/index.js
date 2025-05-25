const express = require('express'); // 
const router = express.Router();

const enquiryRoutes = require('./enquiry.routes');
const clientRoutes = require('./client.routes');
const userRoutes = require('./user.routes');
const loginRoutes =  require('./login.routes');

router.use('/enquiries', enquiryRoutes);
router.use('/clients', clientRoutes);
router.use('/users', userRoutes);
router.use('/login', loginRoutes);

module.exports = router;
