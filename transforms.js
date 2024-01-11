const transforms = [
  {
    origin: [0, 1],
    degrees_rotation: 0,
    x_scale: 0.5,
    y_scale: 0.5,
    color: [1, 0, 0, 0.5],
  },
  {
    origin: [-1.5, -1.5],
    degrees_rotation: 0,
    x_scale: 0.5,
    y_scale: 0.5,
    color: [0, 1, 0, 0.5],
  },
  {
    origin: [1.5, -1.5],
    degrees_rotation: 0,
    x_scale: 0.5,
    y_scale: 0.5,
    color: [0, 0, 1, 0.5],
  },
];

window.transforms = transforms;

export { transforms };
