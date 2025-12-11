const mongoose = require('mongoose');

require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/rapidride';

async function clearActiveRides() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const Ride = mongoose.model('Ride', new mongoose.Schema({}, { strict: false }), 'rides');

        // Update all active rides to cancelled
        const result = await Ride.updateMany(
            { status: { $in: ['requested', 'accepted', 'arrived', 'started'] } },
            { $set: { status: 'cancelled' } }
        );

        console.log(`✅ Updated ${result.modifiedCount} active rides to 'cancelled'`);
        console.log('You can now test with a fresh ride booking!');

        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

clearActiveRides();
