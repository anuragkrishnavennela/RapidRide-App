const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/rapidride';

async function listOnlineDrivers() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(MONGODB_URI);

        const drivers = await mongoose.connection.db.collection('users').find({
            role: 'driver',
            isOnline: true
        }).toArray();

        console.log(`\nFound ${drivers.length} ONLINE drivers:`);
        drivers.forEach(d => {
            console.log(`- Name: ${d.name} | Phone: ${d.phone} | Status: ${d.status} | ID: ${d._id}`);
        });

        if (drivers.length === 0) {
            console.log("No drivers are currently marked as isOnline: true.");
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listOnlineDrivers();
