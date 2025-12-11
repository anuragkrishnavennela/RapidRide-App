const mongoose = require('mongoose');
require('dotenv').config();
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/rapidride';

async function checkDates() {
    try {
        console.log('Connecting...');
        await mongoose.connect(MONGODB_URI);
        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        console.log('\n--- DATES DUMP ---');
        users.forEach(u => {
            console.log(`User: ${u.name} (${u.phone})`);
            console.log(`  CreatedAt:`, JSON.stringify(u.createdAt));
            console.log(`  Type: ${typeof u.createdAt}`);
        });
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
checkDates();
