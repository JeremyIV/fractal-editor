const vertexShaderSource = `#version 300 es
precision highp float;
precision highp int;

/* ──────────────────────────────────────────────────────────────────────
   Chaos-game vertex shader.

   Each vertex (gl_VertexID) renders one attractor point:

   1. Pick a culling prefix by stratified index: prefixes own contiguous
      ranges of vertex ids, sized by their exact probability mass (the
      cumulative starts live in row 2 of uPrefixTex; binary search).

   2. Walk the chain in REVERSE time order, seeded by the prefix's
      innermost map so every junction respects the transition matrix.
      Each step draws an allowed predecessor via an O(1) alias table and
      right-multiplies the step's 2D affine into a running product, so
      no per-step sequence storage is needed. Colors accumulate in the
      same loop with weights identical to the old oldest-first mix chain
      (the oldest step blends with alpha 1).

   3. Apply the prefix matrix. It arrives pre-composed with the
      projection in float64 on the CPU and expressed relative to the
      viewport, so float32 stays accurate at extreme zoom.

   Prefix texture layout (RGBA32F, 2048 wide):
     rows 0-1: prefix p at (col=(p&511)*4, row=p>>9)
       texel+0 = (a, b, tx, R)        projected affine row 1 + chain len
       texel+1 = (c, d, ty, inner+1)  affine row 2 + alias row seed
       texel+2 = composite prefix color (rgba)
     row 2:    col p = (cumulative start index, 0, 0, 0)
   ────────────────────────────────────────────────────────────────────── */

const int MAX_R = 64;

uniform highp sampler2D uPrefixTex;
uniform int   uNumPrefixes;
uniform uint  uPass;        // pass number; (id<<9)|pass gives every point
                            // of every pass a unique random stream
uniform float uPointSize;
uniform float uNumMaps;

uniform vec4 uMapsAff[20];  // per map: [2k]=(a,b,tx,_) [2k+1]=(c,d,ty,_)
uniform vec4 uColors[10];
uniform vec4 uAlias[55];    // alias tables: entry e=(row*10+k) packed two
                            // per vec4: (P[2i],A[2i],P[2i+1],A[2i+1])

out vec4 vColor;

uint pcg(uint v) {
    v = v * 747796405u + 2891336453u;
    uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return (w >> 22u) ^ w;
}

float rnd(inout uint s) {
    s = pcg(s);
    return float(s >> 8u) * (1.0 / 16777216.0);
}

void main() {
    int id = gl_VertexID;

    /* 1. stratified prefix lookup: largest p with cumStart[p] <= id */
    int p = 0;
    for (int step = 512; step >= 1; step >>= 1) {
        int cand = p + step;
        if (cand < uNumPrefixes &&
            texelFetch(uPrefixTex, ivec2(cand, 2), 0).x <= float(id)) {
            p = cand;
        }
    }
    ivec2 base = ivec2((p & 511) * 4, p >> 9);
    vec4 t0 = texelFetch(uPrefixTex, base, 0);
    vec4 t1 = texelFetch(uPrefixTex, base + ivec2(1, 0), 0);
    vec4 pc = texelFetch(uPrefixTex, base + ivec2(2, 0), 0);
    int R   = int(t0.w);
    int row = int(t1.w);  // inner+1: alias row for the first reverse step

    uint seed = pcg((uint(id) << 9) | (uPass & 511u));

    /* 2. reverse-order chain: affine product + color accumulation.
       Color weights reproduce the forward mix chain exactly:
       newest step first, each weighted by alpha * prod(1-alpha_newer),
       oldest step forced to alpha 1. The prefix composite color is the
       newest blend of all, so it goes first. */
    vec3  col = pc.rgb * pc.a;
    float wgt = 1.0 - pc.a;

    float ma = 1.0, mb = 0.0, mtx = 0.0;
    float mc = 0.0, md = 1.0, mty = 0.0;

    for (int i = 0; i < MAX_R; ++i) {
        if (i >= R) break;

        float r = rnd(seed) * uNumMaps;
        int   k = int(r);
        float coin = r - float(k);
        int   e = row * 10 + k;
        vec4  av = uAlias[e >> 1];
        vec2  pa = ((e & 1) == 0) ? av.xy : av.zw;
        int   pick = coin < pa.x ? k : int(pa.y);

        vec4 A0 = uMapsAff[pick * 2];
        vec4 A1 = uMapsAff[pick * 2 + 1];
        // M = M ∘ T_pick
        float na  = ma * A0.x + mb * A1.x;
        float nb  = ma * A0.y + mb * A1.y;
        float ntx = ma * A0.z + mb * A1.z + mtx;
        float nc  = mc * A0.x + md * A1.x;
        float nd  = mc * A0.y + md * A1.y;
        float nty = mc * A0.z + md * A1.z + mty;
        ma = na; mb = nb; mtx = ntx;
        mc = nc; md = nd; mty = nty;

        vec4  C = uColors[pick];
        float alpha = (i == R - 1) ? 1.0 : C.a;
        col += C.rgb * (alpha * wgt);
        wgt *= 1.0 - alpha;

        row = pick + 1;
    }

    /* 3. chain point is M applied to the origin = its translation */
    vec2 pos = vec2(mtx, mty);
    vec2 ndc = vec2(t0.x * pos.x + t0.y * pos.y + t0.z,
                    t1.x * pos.x + t1.y * pos.y + t1.z);

    vColor       = vec4(col, 1.0);
    gl_Position  = vec4(ndc, 0.0, 1.0);
    gl_PointSize = uPointSize;
}
`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec4 vColor;
out vec4 fragColor;

void main() {
    fragColor = vColor;
}`;

export { vertexShaderSource, fragmentShaderSource };
