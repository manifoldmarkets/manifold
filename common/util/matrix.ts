/**
 * Gets the factors of a sparse matrix
 *
 * @param TARGET_MATRIX target matrix
 * @param columns Column names of the target matrix
 * @param LATENT_FEATURES_COUNT Number of latent features
 * @param ITERS Number of times to move towards the real factors
 * @param LEARNING_RATE Learning rate
 * @param REGULARIZATION_RATE Regularization amount, i.e. amount of bias reduction
 * @returns An array containing the two factor matrices
 */
export function factorizeMatrix(
  TARGET_MATRIX: { [column: string]: number }[],
  columns: string[],
  LATENT_FEATURES_COUNT = 5,
  ITERS = 5000,
  LEARNING_RATE = 0.0002,
  REGULARIZATION_RATE = 0.02,
  THRESHOLD = 0.001
) {
  const columnToIndex = Object.fromEntries(columns.map((col, i) => [col, i]))

  const FACTOR1_ROW_COUNT = TARGET_MATRIX.length
  const FACTOR2_ROW_COUNT = columns.length
  const factorMatrix1 = fillMatrix(
    FACTOR1_ROW_COUNT,
    LATENT_FEATURES_COUNT,
    () => Math.random()
  )
  const factorMatrix2 = fillMatrix(
    FACTOR2_ROW_COUNT,
    LATENT_FEATURES_COUNT,
    () => Math.random()
  )

  const columnsOfRow = TARGET_MATRIX.map(Object.keys)

  const updateLatentFeature = (
    latentFeatureA: number,
    latentFeatureB: number,
    error: number
  ) =>
    latentFeatureA +
    LEARNING_RATE *
      (2 * error * latentFeatureB - REGULARIZATION_RATE * latentFeatureA)

  for (let iter = 0; iter < ITERS; iter++) {
    // Iteratively figure out correct factors
    for (let i = 0; i < TARGET_MATRIX.length; i++) {
      const columns = columnsOfRow[i]
      for (const column of columns) {
        // Get actual value on target matrix
        const TRUE_VALUE = TARGET_MATRIX[i][column]
        const j = columnToIndex[column]

        // Get difference of actual value and the current approximate value as error
        const CURRENT_VALUE = dotVectors(factorMatrix1[i], factorMatrix2[j])
        const ERROR = TRUE_VALUE - CURRENT_VALUE

        // Update factor matrices
        for (let k = 0; k < LATENT_FEATURES_COUNT; k++) {
          const latentFeatureA = factorMatrix1[i][k]
          const latentFeatureB = factorMatrix2[j][k]

          // Update latent feature k of factor matrix 1
          factorMatrix1[i][k] = updateLatentFeature(
            latentFeatureA,
            latentFeatureB,
            ERROR
          )

          // Update latent feature k of factor matrix 2
          factorMatrix2[j][k] = updateLatentFeature(
            latentFeatureB,
            latentFeatureA,
            ERROR
          )
        }
      }
    }

    if (iter % 20 === 0) {
      // Calculating totalError
      const TOTAL_ERROR = calculateError(
        TARGET_MATRIX,
        columnToIndex,
        LATENT_FEATURES_COUNT,
        REGULARIZATION_RATE,
        factorMatrix1,
        factorMatrix2
      )
      console.log('iter', iter, 'error', TOTAL_ERROR)

      // Complete factorization process if total error falls below a certain threshold
      if (TOTAL_ERROR < THRESHOLD) break
    }
  }

  return [factorMatrix1, factorMatrix2]
}

/**
 * Calculate total error of factor matrices
 */
function calculateError(
  TARGET_MATRIX: { [column: string]: number }[],
  columnToIndex: { [column: string]: number },
  LATENT_FEATURES_COUNT: number,
  REGULARIZATION_RATE: number,
  factorMatrix1: number[][],
  factorMatrix2: number[][]
) {
  let totalError = 0

  for (let i = 0; i < TARGET_MATRIX.length; i++) {
    const row = TARGET_MATRIX[i]
    for (const column of Object.keys(row)) {
      // Get actual value on target matrix
      const TRUE_VALUE = TARGET_MATRIX[i][column]
      const j = columnToIndex[column]

      // Get difference of actual value and the current approximate value as error
      const CURRENT_VALUE = dotVectors(factorMatrix1[i], factorMatrix2[j])
      const ERROR = TRUE_VALUE - CURRENT_VALUE

      // Increment totalError with current error
      totalError = totalError + ERROR ** 2

      for (let k = 0; k < LATENT_FEATURES_COUNT; k++) {
        totalError =
          totalError +
          (REGULARIZATION_RATE / 2) *
            (factorMatrix1[i][k] ** 2 + factorMatrix2[j][k] ** 2)
      }
    }
  }

  return totalError
}

/**
 * Build completed matrix from matrix factors.
 *
 * @param factors Derived matrix factors
 * @returns Completed matrix
 */
export function buildCompletedMatrix(factors: [number[][], number[][]]) {
  const [FACTOR1, FACTOR2] = factors

  return matrixMultiply(FACTOR1, transpose(FACTOR2))
}

/***************************
 * Helper Functions        *
 ***************************/

/**
 * Transposes a matrix
 *
 * @param matrix Target matrix
 * @returns The transposed matrix
 */
function transpose(matrix: number[][]) {
  return matrix.map((t, i) => t.map((_, j) => matrix[j][i]))
}

/**
 * Gets the dot product of two matrices.
 *
 * @param m First matrix
 * @param n Second matrix
 * @returns Dot product of the two matrices
 */
function matrixMultiply(m: number[][], n: number[][]) {
  const transposedN = transpose(n)

  return m.map((row) => transposedN.map((column) => dotVectors(row, column)))
}

/**
 * Multiplies vectors together and sums the resulting vector up.
 */
function dotVectors(v: number[], w: number[]) {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * w[i]
  return sum
}

/**
 * Creates an n x m matrix filled with the result of given fill function
 *
 * @param n Number of rows
 * @param m Number of columns
 * @param fill Function used to fill the matrix with
 * @returns The filled matrix
 */
function fillMatrix(n: number, m: number, fill = () => 0) {
  const matrix: number[][] = []
  for (let i = 0; i < n; i++) {
    matrix.push([])
    for (let j = 0; j < m; j++) {
      matrix[i][j] = fill()
    }
  }

  return matrix
}
