const transforms = [
  {
    origin: [0, .5, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [1, 0, 0, 0.5],
  },
  {
    origin: [-1.5/2, -1.5/2, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [0, 1, 0, 0.5],
  },
  {
    origin: [1.5/2, -1.5/2, 0],
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
// Plain array, not mat4.create(): gl-matrix mutates in place, so keeping
// the storage as a JS array makes every view-state operation float64.
// Float32 here is what used to cap zooming around 1e5.
let perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

window.transforms = transforms;
window.transition_matrix = transition_matrix;

function getAffineTransform3D(transform) {
  // Convert rotation to radians
  var theta = (transform.degrees_rotation * Math.PI) / 180;

  // Create a blank matrix for combined transformations
  var combinedMatrix = mat4.create();

  // Translate to origin
  mat4.translate(
    combinedMatrix,
    combinedMatrix,
    vec3.fromValues(...transform.origin)
  );

  // Rotate around the specified axis
  if (theta !== 0) {
    mat4.rotate(
      combinedMatrix,
      combinedMatrix,
      theta,
      vec3.fromValues(...transform.rotation_axis)
    );
  }

  // Scale
  mat4.scale(
    combinedMatrix,
    combinedMatrix,
    vec3.fromValues(transform.x_scale, transform.y_scale, transform.z_scale)
  );

  // Translate back
  mat4.translate(
    combinedMatrix,
    combinedMatrix,
    vec3.fromValues(
      -transform.origin[0],
      -transform.origin[1],
      -transform.origin[2]
    )
  );

  return combinedMatrix;
}
export { transforms, transition_matrix, perspective, getAffineTransform3D };
