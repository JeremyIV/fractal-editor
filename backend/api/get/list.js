const { connectToDatabase } = require('../mongodb');
const allowCors = require('../cors-handler');

// Handler function without CORS middleware
const handler = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Connect to MongoDB
    const { collection } = await connectToDatabase();

    // Get all fractals, sorted by creation date (newest first)
    const fractals = await collection.find({})
      .sort({ created_at: -1 })
      .project({ name: 1, created_at: 1, _id: 1 }) // Only return name, created_at, and _id
      .toArray();
    
    console.log(`Retrieved ${fractals.length} fractals`);
    return res.status(200).json(fractals);
  } 
  catch (error) {
    console.error(`Error handling request: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Wrap the handler with the CORS middleware using the Vercel pattern
module.exports = allowCors(handler);