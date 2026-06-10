const vertexShaderSource = `#version 300 es
precision mediump float;

const int MAX_R    = 64;
const int MAX_PFX  = 32;          // must match JS constant

in vec2  aPosition;
in float aIndex;

uniform float uPassCount;
uniform float uR;
uniform float uPointSize;

// row 0: unconditional distribution; row (s+1): distribution over the
// PREDECESSORS of transform s (i.e. the transposed transition matrix),
// so a chain sampled in reverse time order respects every transition
uniform float uCumulativeMarkovMatrix[110];
uniform mat4  uTransforms[10];
uniform vec4  uColors[10];

uniform int   uNumPrefixes;
uniform float uPrefixCDF[MAX_PFX];
uniform mat4  uPrefixMatrices[MAX_PFX];
uniform vec4  uPrefixColors[MAX_PFX];
uniform int   uPrefixInner[MAX_PFX];  // innermost transform of each prefix (-1 = none)

// 1 = stochastic colors (opaque mode): each map OVERRIDES the color with
// probability alpha, keeping colors saturated; low alpha reaches deeper
// (finer-scale) maps, so alpha acts as a frequency dial.
// 0 = smooth mix accumulation (luminous mode).
uniform int   uStochasticColor;

uniform mat4  uProjectionMatrix;

out vec4 vColor;

/* ─ random helpers ─ */
int   nextRandomInt(int x){ int a=1664525,c=1013904223,m=2147483647; return abs((a*x+c)%m); }
float getRandomFloat(int r){ return float(r)/2147483647.0; }

void main() {

    /* ----------------------------------------------------------
       1. choose a terminal prefix
       ---------------------------------------------------------- */
    int rand = int(aIndex) + int(uPassCount)*1000000;
    rand  = nextRandomInt(rand);
    float r = getRandomFloat(rand);

    int   chosen = 0;
    for(int i=0;i<MAX_PFX;i++){
        if(i>=uNumPrefixes) break;
        if(r < uPrefixCDF[i]) { chosen = i; break; }
    }

    /* ----------------------------------------------------------
       2. sample the chaos-game sequence in REVERSE time order,
          seeded by the prefix's innermost transform, so the
          junction between the chain and the prefix (and every
          other step) satisfies the transition matrix
       ---------------------------------------------------------- */
    int n = int(uR);
    int seq[MAX_R];
    int prev = uPrefixInner[chosen];

    for (int i=0; i<MAX_R; ++i) {
        if(i >= n) break;
        rand = nextRandomInt(rand);
        float rf = getRandomFloat(rand);
        int row = (prev+1)*10;
        int pick = 0;
        for(int j=0;j<10;++j){
            if(rf < uCumulativeMarkovMatrix[row+j]){ pick = j; break; }
        }
        seq[i] = pick;
        prev = pick;
    }

    /* ----------------------------------------------------------
       3. apply the sequence in true order (earliest map first)
       ---------------------------------------------------------- */
    vec4 offset = vec4(0.0,0.0,0.0,1.0);
    vec4 transformedColor = vec4(0.0);

    for (int i=MAX_R-1; i>=0; --i) {
        if(i >= n) continue;
        int j = seq[i];
        offset = uTransforms[j] * offset;

        vec4 C = uColors[j];
        if (uStochasticColor == 1) {
            rand = nextRandomInt(rand);
            if (getRandomFloat(rand) < C.a || transformedColor.a == 0.0) {
                transformedColor = vec4(C.rgb, 1.0);
            }
        } else {
            float alpha = (transformedColor.a==0.0)?1.0:C.a;
            transformedColor.a = 1.0;
            transformedColor   = mix(transformedColor, C, alpha);
            transformedColor.a = 1.0;
        }
    }

    offset = uPrefixMatrices[chosen] * offset;

    /* prefix colour blending */
    vec4 prefixC = uPrefixColors[chosen];
    if (uStochasticColor == 1) {
        rand = nextRandomInt(rand);
        if (prefixC.a > 0.0 && getRandomFloat(rand) < prefixC.a) {
            transformedColor = vec4(prefixC.rgb, 1.0);
        }
    } else {
        float alpha = (transformedColor.a==0.0)?1.0:prefixC.a;
        transformedColor.a = 1.0;
        transformedColor   = mix(transformedColor, prefixC, alpha);
        transformedColor.a = 1.0;
    }

    vColor       = transformedColor;
    gl_Position  = uProjectionMatrix * offset;
    gl_PointSize = uPointSize;
}
`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec4 vColor;
out vec4 fragColor;

void main() {
    // Simply output the color that was computed in the vertex shader
    fragColor = vColor;
}`;

export { vertexShaderSource, fragmentShaderSource };
