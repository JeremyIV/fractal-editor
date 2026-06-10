const path = require("path");
const crypto = require("crypto");
const compression = require("compression");
const express = require("express");
const rateLimit = require("express-rate-limit");
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

// Validate and rebuild fractal data from scratch -- only whitelisted,
// bounded, numeric fields are ever stored. Returns null if invalid.
const MAX_TRANSFORMS = 10;
const MAX_NAME_LENGTH = 80;

function finiteNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6
    ? v
    : null;
}

function numberVec(v, n) {
  if (!Array.isArray(v) || v.length !== n) return null;
  const out = v.map(finiteNumber);
  return out.includes(null) ? null : out;
}

function sanitizeFractalData(data) {
  if (!data || typeof data !== "object") return null;
  const { transforms, transition_matrix, render_mode } = data;
  if (
    !Array.isArray(transforms) ||
    transforms.length < 1 ||
    transforms.length > MAX_TRANSFORMS
  ) {
    return null;
  }
  if (
    !Array.isArray(transition_matrix) ||
    transition_matrix.length !== transforms.length
  ) {
    return null;
  }

  const cleanTransforms = [];
  for (const t of transforms) {
    if (!t || typeof t !== "object") return null;
    const clean = {
      origin: numberVec(t.origin, 3),
      degrees_rotation: finiteNumber(t.degrees_rotation),
      rotation_axis: numberVec(t.rotation_axis, 3),
      x_scale: finiteNumber(t.x_scale),
      y_scale: finiteNumber(t.y_scale),
      z_scale: finiteNumber(t.z_scale),
      color: numberVec(t.color, 4),
    };
    if (Object.values(clean).includes(null)) return null;
    cleanTransforms.push(clean);
  }

  const cleanMatrix = [];
  for (const row of transition_matrix) {
    if (!Array.isArray(row) || row.length !== transforms.length) return null;
    cleanMatrix.push(row.map(Boolean));
  }

  const clean = { transforms: cleanTransforms, transition_matrix: cleanMatrix };
  if (render_mode === "luminous") clean.render_mode = "luminous";
  return clean;
}

const app = express();
app.set("trust proxy", 1); // Railway's edge proxy sets X-Forwarded-For
app.use(compression());
app.use(express.json({ limit: "64kb" })); // a real fractal is well under 10kb

// security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'"
  );
  next();
});
app.use(
  express.static(path.join(__dirname, "public"), {
    // no-cache = always revalidate via ETag (304 if unchanged), so every
    // deploy is visible immediately on all devices. The files are tiny;
    // gzip + HTTP/2 keep the revalidation round-trips cheap.
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache");
    },
  })
);

// rate limits: generous for reads, tight for writes
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down" },
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many saves, please slow down" },
});
app.use("/api", apiLimiter);

// Anonymous per-browser identity for favorites — no accounts
app.use("/api", (req, res, next) => {
  let clientId = getCookie(req, CLIENT_ID_COOKIE);
  if (!clientId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(clientId)) {
    clientId = crypto.randomUUID();
    const secure =
      req.secure || req.headers["x-forwarded-proto"] === "https"
        ? "; Secure"
        : "";
    res.setHeader(
      "Set-Cookie",
      `${CLIENT_ID_COOKIE}=${clientId}; Max-Age=${CLIENT_ID_MAX_AGE}; Path=/; SameSite=Lax; HttpOnly${secure}`
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
        .limit(300)
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
app.post("/api/upload", writeLimiter, async (req, res) => {
  const { name, data } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Fractal name is required" });
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return res
      .status(400)
      .json({ error: `Fractal name is too long (max ${MAX_NAME_LENGTH} characters)` });
  }
  const clean = sanitizeFractalData(data);
  if (!clean) {
    return res.status(400).json({ error: "Invalid fractal data format" });
  }
  try {
    const { fractals, favorites } = await getDb();

    const existing = await fractals.findOne(
      { creator_id: req.clientId, name: trimmed },
      { projection: { _id: 1 } }
    );
    if (existing) {
      await fractals.updateOne(
        { _id: existing._id },
        { $set: { data: clean, updated_at: new Date() } }
      );
      return res.json({
        message: "Fractal updated",
        id: existing._id,
        updated: true,
      });
    }

    const result = await fractals.insertOne({
      name: trimmed,
      data: clean,
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
app.delete("/api/fractals/:id", writeLimiter, async (req, res) => {
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
