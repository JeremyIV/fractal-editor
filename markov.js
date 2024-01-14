function get_cumulative_probs(determinants, mask) {
  if (mask === undefined) {
    mask = [];
    for (let i = 0; i < determinants.length; i++) {
      mask.push(true);
    }
  }

  let total = 0.0;

  for (let i = 0; i < determinants.length; i++) {
    if (mask[i]) {
      total += determinants[i];
    }
  }
  let cumulative_sum = 0.0;
  let cumulative_probs = [];
  for (let i = 0; i < determinants.length; i++) {
    if (mask[i]) {
      cumulative_sum += determinants[i] / total;
    }
    cumulative_probs.push(cumulative_sum);
  }
  return cumulative_probs;
}

function getCumulativeMarkovMatrix(determinants, transition_matrix) {
  let initial_row = get_cumulative_probs(determinants);
  let markov_matrix = [];
  for (let i = 0; i < determinants.length; i++) {
    markov_matrix.push(
      get_cumulative_probs(determinants, transition_matrix[i])
    );
  }
  for (let i = determinants.length; i < 10; i++) {
    initial_row.push(1);
  }
  let finalMatrix = initial_row.concat(flattenAndPad(markov_matrix, 10));
  return finalMatrix;
}

function flattenAndPad(matrix, padded_size) {
  let padded_matrix = Array(padded_size * padded_size).fill(1);
  for (let i = 0; i < padded_size; i++) {
    for (let j = 0; j < padded_size; j++) {
      if (i < matrix.length && j < matrix.length) {
        padded_matrix[i * padded_size + j] = matrix[i][j];
      }
    }
  }
  return padded_matrix;
}
