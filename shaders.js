const vertexShaderSource = `#version 300 es
precision mediump float;

const int MAX_R    = 100;
const int MAX_PFX  = 32;          // must match JS constant

in vec2  aPosition;
in float aIndex;

uniform float uPassCount;
uniform float uR;
uniform float uPointSize;

uniform float uCumulativeMarkovMatrix[110];
uniform mat4  uTransforms[10];
uniform vec4  uColors[10];

uniform int   uNumPrefixes;
uniform float uPrefixCDF[MAX_PFX];
uniform mat4  uPrefixMatrices[MAX_PFX];

uniform mat4  uProjectionMatrix;

out vec4 vColor;

/* ─ random helpers (unchanged) ─ */
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

    vec4 offset = vec4(0.0,0.0,0.0,1.0);

    /* ----------------------------------------------------------
       2. chaos-game loop (identical to original)
       ---------------------------------------------------------- */
    vec4 transformedColor = vec4(0.0);
    int  last_transform   = -1;

    for (int i=0; i<MAX_R; ++i) {
        if(i >= int(uR)) break;
        rand = nextRandomInt(rand);
        float rf = getRandomFloat(rand);

        /* pick next transform using cumulative Markov table */
        mat4 T  = mat4(1.0);
        vec4 C  = uColors[9];
        int row = (last_transform+1)*10;

        for(int j=0;j<10;++j){
            if(rf < uCumulativeMarkovMatrix[row+j]){
                T = uTransforms[j];
                C = uColors[j];
                last_transform = j;
                break;
            }
        }
        offset = T * offset;

        /* colour blending (unchanged) */
        float alpha = (transformedColor.a==0.0)?1.0:C.a;
        transformedColor.a = 1.0;
        transformedColor   = mix(transformedColor, C, alpha);
        transformedColor.a = 1.0;
    }
    offset      = uPrefixMatrices[chosen] * offset;

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