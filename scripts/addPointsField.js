const mongoose = require('mongoose');
require('dotenv').config();

const updateUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Add points field to all existing users
    const result = await mongoose.connection.collection('users').updateMany(
      { points: { $exists: true } },
      { $set: { points: 10 } }
    );

    console.log(`Updated ${result.modifiedCount} users`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

updateUsers();
