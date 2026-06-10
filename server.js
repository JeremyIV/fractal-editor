const path = require("path");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "fractal-editor";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "fractals";

let cachedCollection = null;

async function getCollection() {
  if (cachedCollection) return cachedCollection;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedCollection = client.db(DB_NAME).collection(COLLECTION_NAME);
  return cachedCollection;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// List all fractals (metadata only), newest first
app.get("/api/list", async (req, res) => {
  try {
    const collection = await getCollection();
    const fractals = await collection
      .find({})
      .sort({ created_at: -1 })
      .project({ name: 1, created_at: 1 })
      .toArray();
    res.json(fractals);
  } catch (error) {
    console.error("Error listing fractals:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Fetch a single fractal by id
app.get("/api/get/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid fractal ID" });
  }
  try {
    const collection = await getCollection();
    const fractal = await collection.findOne({ _id: new ObjectId(id) });
    if (!fractal) {
      return res.status(404).json({ error: "Fractal not found" });
    }
    res.json(fractal);
  } catch (error) {
    console.error("Error fetching fractal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Save a new fractal
app.post("/api/upload", async (req, res) => {
  const { name, data } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Fractal name is required" });
  }
  if (
    !data ||
    !Array.isArray(data.transforms) ||
    !Array.isArray(data.transition_matrix)
  ) {
    return res.status(400).json({ error: "Invalid fractal data format" });
  }
  try {
    const collection = await getCollection();
    const result = await collection.insertOne({
      name: name.trim(),
      data,
      created_at: new Date(),
    });
    res.status(201).json({
      message: "Fractal stored successfully",
      id: result.insertedId,
    });
  } catch (error) {
    console.error("Error saving fractal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Fractal editor listening on port ${PORT}`);
});
