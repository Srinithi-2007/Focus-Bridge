'use strict';
const mongoose = require('mongoose');
const env = require('./env');

let inMemoryServer = null;

async function connectDB(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  try {
    const options = {
      autoIndex: true,
      serverSelectionTimeoutMS: env.isProd ? 30000 : 2500,
    };
    await mongoose.connect(uri, options);
    console.log(`Connected to MongoDB at ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
    return mongoose.connection;
  } catch (err) {
    if (env.isProd) {
      throw err;
    }
    console.warn(`Could not connect to external MongoDB at ${uri}: ${err.message}`);
    console.log('Starting in-memory MongoDB server for local development...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      inMemoryServer = await MongoMemoryServer.create();
      const memUri = inMemoryServer.getUri();
      await mongoose.connect(memUri, { autoIndex: true });
      console.log(`Connected to in-memory MongoDB at ${memUri}`);
      return mongoose.connection;
    } catch (memErr) {
      console.error('Failed to start in-memory MongoDB fallback:', memErr);
      throw err;
    }
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (inMemoryServer) {
    await inMemoryServer.stop();
    inMemoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
