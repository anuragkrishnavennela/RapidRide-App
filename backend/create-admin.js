// Script to create admin account from terminal
// Usage: node create-admin.js (interactive mode)

const mongoose = require('mongoose');
const readline = require('readline');
const User = require('./models/user');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rapidride';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createAdmin() {
  try {
    console.log('\n🔐 CREATE ADMIN ACCOUNT\n');
    console.log('═'.repeat(50));

    // Get email
    const email = await question('Enter admin email: ');
    if (!email) {
      console.error('❌ Email is required');
      rl.close();
      process.exit(1);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Invalid email format');
      rl.close();
      process.exit(1);
    }

    // Get name
    const name = await question('Enter admin name: ');
    if (!name) {
      console.error('❌ Name is required');
      rl.close();
      process.exit(1);
    }

    // Get phone
    const phone = await question('Enter phone number: ');
    if (!phone) {
      console.error('❌ Phone number is required');
      rl.close();
      process.exit(1);
    }

    // Get password
    const password = await question('Enter admin password: ');
    if (!password || password.length < 6) {
      console.error('❌ Password must be at least 6 characters');
      rl.close();
      process.exit(1);
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('\n' + '═'.repeat(50));
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check for ANY existing admin first (Singleton Policy)
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin && existingAdmin.email !== email) {
      console.error('\n❌ ACCESS DENIED: A Super Admin already exists!');
      console.error(`   Current Admin: ${existingAdmin.email}`);
      console.error('   security policy restricts the system to ONE admin account.');
      await mongoose.connection.close();
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (existingUser.role === 'admin') {
        console.log('ℹ️  User already exists and is already an admin');
        console.log(`   Email: ${existingUser.email}`);
        console.log(`   Name: ${existingUser.name}`);
        console.log(`   Phone: ${existingUser.phone}`);
        console.log(`   Created: ${existingUser.createdAt}`);
      } else {
        // Update existing user to admin
        existingUser.role = 'admin';
        existingUser.name = name;
        existingUser.phone = phone;
        await existingUser.save();
        console.log('✅ Existing user updated to admin role');
        console.log(`   Email: ${existingUser.email}`);
        console.log(`   Name: ${existingUser.name}`);
        console.log(`   Phone: ${existingUser.phone}`);
        console.log(`   Role: ${existingUser.role}`);
      }
    } else {
      // Create new admin user
      const adminUser = new User({
        email,
        name,
        phone,
        password: hashedPassword,
        role: 'admin',
        emailVerified: true, // Auto-verify admin
        phoneVerified: false
      });

      await adminUser.save();
      console.log('✅ Admin account created successfully!');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Name: ${adminUser.name}`);
      console.log(`   Phone: ${adminUser.phone}`);
      console.log(`   Role: ${adminUser.role}`);
      console.log(`   ID: ${adminUser._id}`);
      console.log('\n🔐 Admin can now sign in using EMAIL and PASSWORD');
    }

    await mongoose.connection.close();
    console.log('═'.repeat(50));
    console.log('✅ Done!\n');
    rl.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    rl.close();
    process.exit(1);
  }
}

createAdmin();
