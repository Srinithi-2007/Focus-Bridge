'use strict';
const mongoose = require('mongoose');
const env = require('./env');

let inMemoryServer = null;
let connectionPromise = null;

function normalizeMongoUri(rawUri) {
  if (!rawUri) return rawUri;
  try {
    const parsed = new URL(rawUri);
    // If pathname is missing or just '/', default database to 'focusbridge'
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/focusbridge';
    }
    // Ensure retryWrites and w=majority query parameters exist for SRV clusters
    if (parsed.protocol === 'mongodb+srv:') {
      if (!parsed.searchParams.has('retryWrites')) {
        parsed.searchParams.set('retryWrites', 'true');
      }
      if (!parsed.searchParams.has('w')) {
        parsed.searchParams.set('w', 'majority');
      }
    }
    return parsed.toString();
  } catch {
    return rawUri;
  }
}

async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  const targetUri = normalizeMongoUri(uri);
  mongoose.set('strictQuery', true);

  if (!mongoose.connection.listenerCount('disconnected')) {
    mongoose.connection.on('disconnected', () => {
      connectionPromise = null;
    });
  }

  connectionPromise = (async () => {
    try {
      const options = {
        autoIndex: !env.isProd, // Don't block serverless cold starts on index creation
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      };
      await mongoose.connect(targetUri, options);
      console.log(`Connected to MongoDB at ${targetUri.replace(/\/\/.*@/, '//<credentials>@')}`);
      return mongoose.connection;
    } catch (err) {
      connectionPromise = null; // Reset promise on failure so next request can retry
      if (env.isProd) {
        throw err;
      }
      console.warn(`Could not connect to external MongoDB at ${targetUri}: ${err.message}`);
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
  })();

  return connectionPromise;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (inMemoryServer) {
    await inMemoryServer.stop();
    inMemoryServer = null;
  }
  connectionPromise = null;
}

module.exports = { connectDB, disconnectDB, normalizeMongoUri };
