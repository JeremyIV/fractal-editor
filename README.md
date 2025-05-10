# Fractal Editor

An interactive 3D fractal visualization tool using WebGL for creating and manipulating Iterated Function Systems (IFS) fractals.

## Features

- Real-time 3D fractal rendering using WebGL
- Interactive transformation controls for manipulating fractal attributes
- Adjustable parameters including:
  - Position (origin)
  - Rotation (axis and angle)
  - Scale (x, y, z)
  - Color
- Support for Markov transition matrices to control fractal generation paths
- 3D shading for improved depth perception
- Responsive design that works on both desktop and mobile devices

## How It Works

The fractal editor uses the Chaos Game algorithm to generate Iterated Function Systems (IFS) fractals. It works by:

1. Starting with a point in 3D space
2. Randomly selecting one of the defined transformations
3. Applying the transformation to the current point
4. Repeating steps 2-3 many times to create the fractal pattern
5. Rendering the results using WebGL with 3D shading

The transition matrix allows control over which transformations can follow others, enabling more complex fractal structures.

## Getting Started

1. Clone this repository
2. Open `index.html` in a modern web browser that supports WebGL 2.0
3. Use the menu button (☰) to open the transformation controls
4. Experiment with different settings to create unique fractals

## Controls

- Click and drag transformation handles to move transformation origins
- Use the transformation panel to adjust settings:
  - Origin coordinates (x, y, z)
  - Rotation axis and angle
  - Scale factors
  - Color
- Add new transformations with the '+' button
- Toggle the toolbar with the '☰' button
- Use the "Transition Matrix" button to define which transformations can follow each other

## Technologies Used

- WebGL 2.0 for GPU-accelerated rendering
- GLSL shaders for efficient point processing and visualization
- JavaScript for the user interface and application logic
- CSS for styling and responsive design

## License

This project is open source and available for personal and educational use.