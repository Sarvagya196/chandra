const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

router.post("/", async(req, res) => {
    try {
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not configured");
            return res.status(500).json({ message: "server error" });
        }

        const { email, password} = req.body;

        const user = await User.findOne({ email });
        if(!user) {
            return res.status(400).json({message: 'Invalid email or Password'});
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch) {
            return res.status(400).json({message: 'Invalid email or Password'});
        }

        const token = jwt.sign(
        {
            Id: user._id,
            Role: user.role,
            ClientId: user.clientId||null,
        },
            process.env.JWT_SECRET
        );

        res.json({token});
    }
    catch (error) {
        console.log("Error during login", error);
        res.status(500).json({ message: "server error"});
    }
});

module.exports = router;

