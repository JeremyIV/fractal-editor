const { connectToDatabase } = require('../mongodb');
const allowCors = require('../cors-handler');

// Handler function without CORS middleware
const handler = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Connect to MongoDB
    const { collection } = await connectToDatabase();

    const data = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    // Insert the new fractal
    const result = await collection.insertOne({
      ...data,
      created_at: new Date()
    });
    
    console.log(`Stored new fractal: ${result.insertedId}`);
    return res.status(201).json({ 
      message: 'Fractal stored successfully',
      id: result.insertedId
    });
  } 
  catch (error) {
    console.error(`Error handling request: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Wrap the handler with the CORS middleware using the Vercel pattern
module.exports = allowCors(handler);