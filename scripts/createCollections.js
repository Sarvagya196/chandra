require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const names = collections.map(c => c.name);

    if (names.includes('designembeddings')) {
        console.log('Collection "designembeddings" already exists — nothing to do.');
    } else {
        await db.createCollection('designembeddings');
        console.log('Collection "designembeddings" created successfully.');
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
