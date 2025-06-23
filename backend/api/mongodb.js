const { MongoClient } = require('mongodb');

// Connection URI - we'll get this from environment variables in production
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'fractal-editor';
const collectionName = process.env.MONGODB_COLLECTION || 'fractals';

// Cached connection
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  // Connect to MongoDB
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  
  cachedDb = { 
    client, 
    db, 
    collection: db.collection(collectionName)
  };

  return cachedDb;
}

module.exports = { connectToDatabase };