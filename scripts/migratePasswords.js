require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/user.model');

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const users = await User.find({});
    let migrated = 0, skipped = 0;

    for (const user of users) {
        if (user.password.startsWith('$2')) { skipped++; continue; }
        const hashed = await bcrypt.hash(user.password, 10);
        await User.updateOne({ _id: user._id }, { password: hashed });
        console.log(`Migrated: ${user.email}`);
        migrated++;
    }

    console.log(`Done — migrated: ${migrated}, skipped (already hashed): ${skipped}`);
    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
