const path = require("path");
const crypto = require("crypto");
const compression = require("compression");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "fractal-editor";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "fractals";

const CLIENT_ID_COOKIE = "client_id";
const CLIENT_ID_MAX_AGE = 60 * 60 * 24 * 730; // 2 years

let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const fractals = db.collection(COLLECTION_NAME);
  const favorites = db.collection("favorites");

  // favorites is the source of truth; one favorite per (fractal, client)
  await favorites.createIndex(
    { fractal_id: 1, client_id: 1 },
    { unique: true }
  );
  await favorites.createIndex({ client_id: 1 });
  await fractals.createIndex({ favorite_count: -1, created_at: -1 });
  await fractals.createIndex({ creator_id: 1, name: 1 });
  // backfill the denormalized count on docs that predate favorites
  await fractals.updateMany(
    { favorite_count: { $exists: false } },
    { $set: { favorite_count: 0 } }
  );

  cachedDb = { fractals, favorites };
  return cachedDb;
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

const app = express();
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    // Cache assets for an hour; keep HTML revalidating so deploys show up immediately
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// Anonymous per-browser identity for favorites — no accounts
app.use("/api", (req, res, next) => {
  let clientId = getCookie(req, CLIENT_ID_COOKIE);
  if (!clientId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(clientId)) {
    clientId = crypto.randomUUID();
    res.setHeader(
      "Set-Cookie",
      `${CLIENT_ID_COOKIE}=${clientId}; Max-Age=${CLIENT_ID_MAX_AGE}; Path=/; SameSite=Lax`
    );
  }
  req.clientId = clientId;
  next();
});

// List all fractals (metadata only).
// ?sort=recent for newest-first; default is most-favorited-first.
// Each item carries `favorited`: whether *this* client has favorited it.
app.get("/api/list", async (req, res) => {
  try {
    const { fractals, favorites } = await getDb();
    const sortOrder =
      req.query.sort === "recent"
        ? { created_at: -1 }
        : { favorite_count: -1, created_at: -1 };

    const [list, mine] = await Promise.all([
      fractals
        .find({})
        .sort(sortOrder)
        .project({ name: 1, created_at: 1, favorite_count: 1, creator_id: 1 })
        .toArray(),
      favorites.find({ client_id: req.clientId }).toArray(),
    ]);

    const myFavorites = new Set(mine.map((f) => String(f.fractal_id)));
    // creator_id is the ownership capability -- never expose it, only `mine`
    res.json(
      list.map(({ creator_id, ...f }) => ({
        ...f,
        favorited: myFavorites.has(String(f._id)),
        mine: creator_id === req.clientId,
      }))
    );
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
    const { fractals } = await getDb();
    const fractal = await fractals.findOne(
      { _id: new ObjectId(id) },
      { projection: { creator_id: 0 } }
    );
    if (!fractal) {
      return res.status(404).json({ error: "Fractal not found" });
    }
    res.json(fractal);
  } catch (error) {
    console.error("Error fetching fractal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Save a fractal. Names are unique per creator: saving with a name you've
// already used overwrites that fractal (keeping its id and favorites).
// New fractals are automatically favorited by their uploader.
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
    const { fractals, favorites } = await getDb();
    const trimmed = name.trim();

    const existing = await fractals.findOne(
      { creator_id: req.clientId, name: trimmed },
      { projection: { _id: 1 } }
    );
    if (existing) {
      await fractals.updateOne(
        { _id: existing._id },
        { $set: { data, updated_at: new Date() } }
      );
      return res.json({
        message: "Fractal updated",
        id: existing._id,
        updated: true,
      });
    }

    const result = await fractals.insertOne({
      name: trimmed,
      data,
      created_at: new Date(),
      creator_id: req.clientId,
      favorite_count: 1,
    });
    await favorites.insertOne({
      fractal_id: result.insertedId,
      client_id: req.clientId,
      created_at: new Date(),
    });
    res.status(201).json({
      message: "Fractal stored successfully",
      id: result.insertedId,
      updated: false,
    });
  } catch (error) {
    console.error("Error saving fractal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a fractal -- only its creator can, favorites are cleaned up too
app.delete("/api/fractals/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid fractal ID" });
  }
  const fractalId = new ObjectId(id);
  try {
    const { fractals, favorites } = await getDb();
    const fractal = await fractals.findOne(
      { _id: fractalId },
      { projection: { creator_id: 1 } }
    );
    if (!fractal) {
      return res.status(404).json({ error: "Fractal not found" });
    }
    if (fractal.creator_id !== req.clientId) {
      return res.status(403).json({ error: "Only the creator can delete this fractal" });
    }
    await fractals.deleteOne({ _id: fractalId });
    await favorites.deleteMany({ fractal_id: fractalId });
    res.json({ message: "Fractal deleted" });
  } catch (error) {
    console.error("Error deleting fractal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Favorite / unfavorite. Idempotent: the unique index on (fractal_id,
// client_id) decides whether the denormalized count actually moves.
async function setFavorite(req, res, favorited) {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid fractal ID" });
  }
  const fractalId = new ObjectId(id);
  try {
    const { fractals, favorites } = await getDb();
    const fractal = await fractals.findOne(
      { _id: fractalId },
      { projection: { _id: 1 } }
    );
    if (!fractal) {
      return res.status(404).json({ error: "Fractal not found" });
    }

    let changed = false;
    if (favorited) {
      try {
        await favorites.insertOne({
          fractal_id: fractalId,
          client_id: req.clientId,
          created_at: new Date(),
        });
        changed = true;
      } catch (error) {
        if (error.code !== 11000) throw error; // 11000 = already favorited
      }
    } else {
      const result = await favorites.deleteOne({
        fractal_id: fractalId,
        client_id: req.clientId,
      });
      changed = result.deletedCount === 1;
    }

    let doc;
    if (changed) {
      const updated = await fractals.findOneAndUpdate(
        { _id: fractalId },
        { $inc: { favorite_count: favorited ? 1 : -1 } },
        { returnDocument: "after", projection: { favorite_count: 1 } }
      );
      doc = updated;
    } else {
      doc = await fractals.findOne(
        { _id: fractalId },
        { projection: { favorite_count: 1 } }
      );
    }

    res.json({ favorited, favorite_count: doc.favorite_count });
  } catch (error) {
    console.error("Error updating favorite:", error);
    res.status(500).json({ error: "Server error" });
  }
}

app.put("/api/fractals/:id/favorite", (req, res) => setFavorite(req, res, true));
app.delete("/api/fractals/:id/favorite", (req, res) => setFavorite(req, res, false));

app.listen(PORT, () => {
  console.log(`Fractal editor listening on port ${PORT}`);
});
