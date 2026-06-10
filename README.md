# Fractal Editor

An interactive fractal visualization tool using WebGL for creating and manipulating Iterated Function Systems (IFS) fractals, with save/load backed by MongoDB.

## Features

- Real-time fractal rendering using WebGL 2.0
- Interactive transformation controls for manipulating fractal attributes
- Adjustable parameters including:
  - Position (origin)
  - Rotation (axis and angle)
  - Scale (x, y, z)
  - Color
- Markov transition matrices to control fractal generation paths
- Save and load fractals to a MongoDB database
- Responsive design that works on both desktop and mobile devices

## How It Works

The fractal editor uses the Chaos Game algorithm to generate IFS fractals:

1. Start with a point in space
2. Randomly select one of the defined transformations
3. Apply the transformation to the current point
4. Repeat steps 2-3 many times to create the fractal pattern

The whole loop runs in a GLSL vertex shader, so millions of points render in real time. A prefix tree over the transform sequence space is used for frustum culling when zoomed in, so deep zooms stay sharp.

The transition matrix allows control over which transformations can follow others, enabling more complex fractal structures.

## Architecture

- `public/` — static frontend (vanilla ES modules, no build step)
  - `renderer.js` — WebGL setup, chaos-game rendering, progressive passes
  - `shaders.js` — GLSL vertex/fragment shaders
  - `transforms.js` — the shared transform list and transition matrix
  - `buildPrefixTree.js` — frustum-culling prefix tree
  - `markov.js` — cumulative Markov matrix for transform selection
  - `database.js` — API client for save/load
  - `gui/` — toolbar, transform forms, transition matrix UI, drag handles
- `server.js` — Express server: serves `public/` and the `/api` routes
  - `GET /api/list` — list saved fractals (metadata)
  - `GET /api/get/:id` — fetch one fractal
  - `POST /api/upload` — save a fractal

## Running Locally

```sh
npm install
MONGODB_URI="mongodb://localhost:27017" npm start
# open http://localhost:3000
```

The editor itself works without a database; only save/load require `MONGODB_URI`.

## Deployment (Railway)

The app deploys as a single Railway service (config in `railway.json`):

1. Create a service from this repo (or `railway up` from the repo root).
2. Add a MongoDB database to the project, or use an external MongoDB.
3. Set `MONGODB_URI` on the service (reference the Railway Mongo variable, e.g. `${{ MongoDB.MONGO_URL }}`).

Environment variables (see `.env.example`): `MONGODB_URI` (required for save/load), `MONGODB_DB` (default `fractal-editor`), `MONGODB_COLLECTION` (default `fractals`), `PORT` (set automatically by Railway).

## Controls

- Click and drag transformation handles to move transformation origins
- Drag a selected handle's surroundings to scale/rotate that transform; drag empty canvas to pan; scroll to zoom
- Use the transformation panel (☰) to adjust origin, rotation, scale, and color numerically
- Add new transformations with the '+' button
- Use the "Transition Matrix" button to define which transformations can follow each other
- Use the 💾 button to save the current fractal or load a saved one

## License

This project is open source and available for personal and educational use.
