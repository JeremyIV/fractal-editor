const transforms = [
  {
    origin: [0, 1, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [1, 0, 0, 0.5],
  },
  {
    origin: [-1.5, -1.5, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [0, 1, 0, 0.5],
  },
  {
    origin: [1.5, -1.5, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [0, 0, 1, 0.5],
  },
];

let transition_matrix = [
  [true, true, true],
  [true, true, true],
  [true, true, true],
];
let perspective = mat4.create();

perspective = mat4.rotate(
  perspective,
  perspective,
  (0 * Math.PI) / 180,
  vec3.fromValues(0, 1, 0)
);

console.log(perspective);

window.transforms = transforms;
window.transition_matrix = transition_matrix;

export { transforms, transition_matrix, perspective };
