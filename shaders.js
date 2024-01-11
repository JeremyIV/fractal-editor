const old_vertexShaderSource = `#version 300 es
precision mediump float; // Specify the precision for float types

const int MAX_R = 10; // Set this to the maximum expected recursion level

attribute vec2 aPosition;
attribute float aIndex;

varying vec4 vColor; // pass the computed color to the fragment shader

uniform float uR;
uniform float uNumTransforms;
uniform mat4 uTransform0;
uniform mat4 uTransform1;
uniform mat4 uTransform2;
uniform mat4 uTransform3;
uniform mat4 uTransform4;
uniform mat4 uTransform5;
uniform mat4 uTransform6;
uniform mat4 uTransform7;
uniform mat4 uTransform8;
uniform mat4 uTransform9;

uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uC2;
uniform vec4 uC3;
uniform vec4 uC4;
uniform vec4 uC5;
uniform vec4 uC6;
uniform vec4 uC7;
uniform vec4 uC8;
uniform vec4 uC9;

uniform mat4 uProjectionMatrix; // The projection matrix

float randomSeed()

void main() {
    vec4 offset = vec4(0.0, 0.0, 0.0, 1.0);
    vec4 transformedColor = vec4(0.0, 0.0, 0.0, 0.0);
    float quotient = aIndex;

    for (int i=0; i < MAX_R; i++) {
        if (i >= int(uR)) break;
        float remainder = mod(quotient, uNumTransforms);
        quotient = floor(quotient / uNumTransforms);

        mat4 transform;
        vec4 color;
        if (remainder == 0.0) {transform = uTransform0; color = uC0;}
        else if (remainder == 1.0) {transform = uTransform1; color = uC1;}
        else if (remainder == 2.0) {transform = uTransform2; color = uC2;}
        else if (remainder == 3.0) {transform = uTransform3; color = uC3;}
        else if (remainder == 4.0) {transform = uTransform4; color = uC4;}
        else if (remainder == 5.0) {transform = uTransform5; color = uC5;}
        else if (remainder == 6.0) {transform = uTransform6; color = uC6;}
        else if (remainder == 7.0) {transform = uTransform7; color = uC7;}
        else if (remainder == 8.0) {transform = uTransform8; color = uC8;}
        else if (remainder == 9.0) {transform = uTransform9; color = uC9;}
        else {transform = mat4(1.0); color = uC9;} // Identity matrix as a default

        offset = transform * offset;
        float alpha;
        if (transformedColor[3] == 0.0) alpha = 1.0;
        else alpha = color[3];
        transformedColor[3] = 1.0;
        transformedColor = mix(transformedColor, color, alpha);
    }
    vColor = transformedColor;
    gl_Position = uProjectionMatrix * (vec4(aPosition, 0.0, 1.0) +  offset);
}`;

// TODO: there appears to be a bug which favors selecting the first transform.
const vertexShaderSource = `#version 300 es

precision mediump float; // Specify the precision for float types

const int MAX_R = 100; // Set this to the maximum expected recursion level

in vec2 aPosition;
in float aIndex;

out vec4 vColor; // pass the computed color to the fragment shader

uniform float uR; 

uniform float uNumTransforms;

uniform float uW0;
uniform float uW1;
uniform float uW2;
uniform float uW3;
uniform float uW4;
uniform float uW5;
uniform float uW6;
uniform float uW7;
uniform float uW8;
uniform float uW9;

uniform mat4 uTransform0;
uniform mat4 uTransform1;
uniform mat4 uTransform2;
uniform mat4 uTransform3;
uniform mat4 uTransform4;
uniform mat4 uTransform5;
uniform mat4 uTransform6;
uniform mat4 uTransform7;
uniform mat4 uTransform8;
uniform mat4 uTransform9;

uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uC2;
uniform vec4 uC3;
uniform vec4 uC4;
uniform vec4 uC5;
uniform vec4 uC6;
uniform vec4 uC7;
uniform vec4 uC8;
uniform vec4 uC9;

uniform mat4 uProjectionMatrix; // The projection matrix

int nextRandomInt(int x) {
    int a = 1664525;
    int c = 1013904223;
    int m = 2147483647; // 2^31 - 1, a prime number
    return (a * x + c) % m;
}

float getRandomFloat(int randomInt) {
    return ((float(randomInt) / 2147483647.0) + 1.0) / 2.0;
}

void main() {
    vec4 offset = vec4(0.0, 0.0, 0.0, 1.0);
    vec4 transformedColor = vec4(0.0, 0.0, 0.0, 0.0);
    int randomInt = int(aIndex) + 1000;

    for (int i=0; i < MAX_R; i++) {
        if (i >= int(uR)) break;
        randomInt = nextRandomInt(randomInt);
        float randomFloat = getRandomFloat(randomInt);

        mat4 transform;
        vec4 color;
        if (randomFloat < uW0) {transform = uTransform0; color = uC0;}
        else if (randomFloat < uW1) {transform = uTransform1; color = uC1;}
        else if (randomFloat < uW2) {transform = uTransform2; color = uC2;}
        else if (randomFloat < uW3) {transform = uTransform3; color = uC3;}
        else if (randomFloat < uW4) {transform = uTransform4; color = uC4;}
        else if (randomFloat < uW5) {transform = uTransform5; color = uC5;}
        else if (randomFloat < uW6) {transform = uTransform6; color = uC6;}
        else if (randomFloat < uW7) {transform = uTransform7; color = uC7;}
        else if (randomFloat < uW8) {transform = uTransform8; color = uC8;}
        else if (randomFloat < uW9) {transform = uTransform9; color = uC9;}
        else {transform = mat4(1.0); color = uC9;} // Identity matrix as a default

        offset = transform * offset;
        float alpha;
        if (transformedColor[3] == 0.0) alpha = 1.0;
        else alpha = color[3];
        transformedColor[3] = 1.0;
        transformedColor = mix(transformedColor, color, alpha);
    }
    vColor = transformedColor;
    gl_Position = uProjectionMatrix * (vec4(aPosition, 0.0, 1.0) +  offset);
}`;

const fragmentShaderSource = `#version 300 es

    precision mediump float; // Specify the precision for float types

    in vec4 vColor;
    out vec4 fragColor;

    void main() {
        fragColor = vColor;
    }
`;

export { vertexShaderSource, fragmentShaderSource };
