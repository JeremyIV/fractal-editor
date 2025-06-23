const { connectToDatabase } = require('../mongodb');
const allowCors = require('../cors-handler');
const { ObjectId } = require('mongodb');

// Handler function without CORS middleware
const handler = async (req, res) => {
  // Get id from the URL path
  const id = req.query.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Fractal ID is required' });
  }

  try {
    // Connect to MongoDB
    const { collection } = await connectToDatabase();

    if (req.method === 'GET') {
      // GET request - retrieve fractal
      let query;
      try {
        query = { _id: new ObjectId(id) };
      } catch (e) {
        // If ObjectId conversion fails, try string match
        query = { _id: id };
      }
      
      const result = await collection.findOne(query);
      
      if (result) {
        console.log(`Retrieved fractal: ${id}`);
        return res.status(200).json(result);
      } else {
        console.log(`Fractal not found: ${id}`);
        return res.status(404).json({ error: 'Fractal not found' });
      }
    } 
    else {
      // Method not allowed
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } 
  catch (error) {
    console.error(`Error handling request: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Wrap the handler with the CORS middleware using the Vercel pattern
module.exports = allowCors(handler);