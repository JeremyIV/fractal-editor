const vertexShaderSource = `#version 300 es

precision mediump float; // Specify the precision for float types

const int MAX_R = 100; // Set this to the maximum expected recursion level

in vec2 aPosition;
in float aIndex;

out vec4 vColor; // pass the computed color to the fragment shader
out vec2 vTexCoord;
out float vDepth;

uniform float uR; 

uniform float uNumTransforms;

uniform float uCumulativeMarkovMatrix[110];
uniform mat4 uTransforms[10];
uniform vec4 uColors[10];

uniform mat4 uProjectionMatrix; 

int nextRandomInt(int x) {
    int a = 1664525;
    int c = 1013904223;
    int m = 2147483647; // 2^31 - 1, a prime number
    return abs((a * x + c) % m);
}

float getRandomFloat(int randomInt) {
    return float(randomInt) / 2147483647.0;
}

void main() {
    vec4 offset = vec4(0.0, 0.0, 0.0, 1.0);
    vec4 transformedColor = vec4(0.0, 0.0, 0.0, 0.0);
    int randomInt = int(aIndex);

    int last_transform = -1;

    for (int i=0; i < MAX_R; i++) {
        if (i >= int(uR)) break;
        randomInt = nextRandomInt(randomInt);
        float randomFloat = getRandomFloat(randomInt);



        mat4 transform = mat4(1.0);
        vec4 color = uColors[9];

        int row_offset = (last_transform + 1) * 10;

        for (int j=0; j < 10; j++) {
            if (randomFloat < uCumulativeMarkovMatrix[row_offset + j]) {
                transform = uTransforms[j];
                color = uColors[j];
                last_transform = j;
                break;
            }
        }

        offset = transform * offset;
        float alpha;
        if (transformedColor[3] == 0.0) alpha = 1.0;
        else alpha = color[3];
        transformedColor[3] = 1.0;
        transformedColor = mix(transformedColor, color, alpha);
        transformedColor[3] = 1.0;
    }
    vColor = transformedColor;
    vTexCoord = normalize(vec2(aPosition.x, aPosition.y));
    gl_Position =  vec4(aPosition, 0.0, 1.0) + uProjectionMatrix * offset;
    vDepth = (gl_Position.z / gl_Position.w) * 0.5 + 0.5;
    gl_PointSize = 1.0;
}`;

const fragmentShaderSource = `#version 300 es

    precision mediump float; // Specify the precision for float types

    in vec4 vColor;
    in vec2 vTexCoord;
    in float vDepth;
    out vec4 fragColor;
    uniform float uSphereRadius;

    void main() {       
        float normed_rad = length(vTexCoord) * 2.0;
        
        if (normed_rad > 1.0) {
            fragColor = vec4(0.0,0.0,0.0,1.0);
            gl_FragDepth = 1.0; // Adjust fragment depth    
        } else{
            float normalized_depth_offset = sqrt(1.0 - normed_rad * normed_rad);
            vec3 normal = normalize(vec3(vTexCoord.x, vTexCoord.y, normalized_depth_offset)); // Normalize the normal vector
            
            vec3 light = normalize(vec3(-1.0, 1.0, 1.0)); // Assuming light direction is normalized
            float lightIntensity = dot(light, normal); // Clamp dot product to [0, 1]
            vec4 outColor = vColor * (0.2 + lightIntensity);
            outColor.w = 1.0;
            float depth_offset = uSphereRadius * normalized_depth_offset; // Calculate depth offset
            gl_FragDepth = vDepth - 0.5*depth_offset;
            fragColor = outColor; // Apply lighting effect
        }
    }
    `;

export { vertexShaderSource, fragmentShaderSource };
