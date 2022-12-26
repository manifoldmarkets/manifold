/**
 * Gets the factors of a sparse matrix
 *
 * @param {Array} TARGET_MATRIX target matrix
 * @param {Number} LATENT_FEATURES_COUNT Number of latent features
 * @param {Number} ITERS Number of times to move towards the real factors
 * @param {Number} LEARNING_RATE Learning rate
 * @param {Number} REGULARIZATION_RATE Regularization amount, i.e. amount of bias reduction
 * @returns {Array} An array containing the two factor matrices
 */
export function factorizeSparseMatrix(
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
  const transposedFactorMatrix2 = transpose(factorMatrix2)
  const ROW_COUNT = TARGET_MATRIX.length
  const COLUMN_COUNT = columns.length
  const updateLatentFeature = (
    latentFeatureA: number,
    latentFeatureB: number,
    error: number
  ) =>
    latentFeatureA +
    LEARNING_RATE *
      (2 * error * latentFeatureB - REGULARIZATION_RATE * latentFeatureA)

  doFor(ITERS, () => {
    // Iteratively figure out correct factors
    for (let i = 0; i < ROW_COUNT; i++) {
      const row = TARGET_MATRIX[i]
      for (const column of Object.keys(row)) {
        // Get actual value on target matrix
        const TRUE_VALUE = TARGET_MATRIX[i][column]
        const j = columnToIndex[column]

        // Process non-empty values
        if (TRUE_VALUE > 0) {
          // Get difference of actual value and the current approximate value as error
          const CURRENT_VALUE = dotVectors(
            factorMatrix1[i],
            columnVector(transposedFactorMatrix2, j)
          )
          const ERROR = TRUE_VALUE - CURRENT_VALUE

          // Update factor matrices
          for (let k = 0; k++; k < LATENT_FEATURES_COUNT) {
            const latentFeatureA = factorMatrix1[i][k]
            const latentFeatureB = transposedFactorMatrix2[k][j]

            // Update latent feature k of factor matrix 1
            factorMatrix1[i][k] = updateLatentFeature(
              latentFeatureA,
              latentFeatureB,
              ERROR
            )

            // Update latent feature k of factor matrix 2
            transposedFactorMatrix2[k][j] = updateLatentFeature(
              latentFeatureB,
              latentFeatureA,
              ERROR
            )
          }
        }
      }
    }

    /*
    // Calculating totalError
    const TOTAL_ERROR = calculateError(
      ROW_COUNT,
      COLUMN_COUNT,
      TARGET_MATRIX,
      LATENT_FEATURES_COUNT,
      REGULARIZATION_RATE,
      factorMatrix1,
      transposedFactorMatrix2
    )

    // Complete factorization process if total error falls below a certain threshold
    if (TOTAL_ERROR < THRESHOLD) return
    */
  })

  return [factorMatrix1, transpose(transposedFactorMatrix2)]
}

/**
 * Gets the factors of a matrix
 *
 * @param {Array} TARGET_MATRIX target matrix
 * @param {Number} LATENT_FEATURES_COUNT Number of latent features
 * @param {Number} ITERS Number of times to move towards the real factors
 * @param {Number} LEARNING_RATE Learning rate
 * @param {Number} REGULARIZATION_RATE Regularization amount, i.e. amount of bias reduction
 * @returns {Array} An array containing the two factor matrices
 */
export function factorizeMatrix(
  TARGET_MATRIX: number[][],
  LATENT_FEATURES_COUNT = 5,
  ITERS = 5000,
  LEARNING_RATE = 0.0002,
  REGULARIZATION_RATE = 0.02,
  THRESHOLD = 0.001
) {
  const FACTOR1_ROW_COUNT = TARGET_MATRIX.length
  const FACTOR2_ROW_COUNT = TARGET_MATRIX[0].length
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
  const transposedFactorMatrix2 = transpose(factorMatrix2)
  const ROW_COUNT = TARGET_MATRIX.length
  const COLUMN_COUNT = TARGET_MATRIX[0].length
  const updateLatentFeature = (
    latentFeatureA: number,
    latentFeatureB: number,
    error: number
  ) =>
    latentFeatureA +
    LEARNING_RATE *
      (2 * error * latentFeatureB - REGULARIZATION_RATE * latentFeatureA)

  doFor(ITERS, () => {
    // Iteratively figure out correct factors
    doFor(ROW_COUNT, (i) => {
      doFor(COLUMN_COUNT, (j) => {
        // Get actual value on target matrix
        const TRUE_VALUE = TARGET_MATRIX[i][j]

        // Process non-empty values
        if (TRUE_VALUE > 0) {
          // Get difference of actual value and the current approximate value as error
          const CURRENT_VALUE = dotVectors(
            factorMatrix1[i],
            columnVector(transposedFactorMatrix2, j)
          )
          const ERROR = TRUE_VALUE - CURRENT_VALUE

          // Update factor matrices
          doFor(LATENT_FEATURES_COUNT, (k) => {
            const latentFeatureA = factorMatrix1[i][k]
            const latentFeatureB = transposedFactorMatrix2[k][j]

            // Update latent feature k of factor matrix 1
            factorMatrix1[i][k] = updateLatentFeature(
              latentFeatureA,
              latentFeatureB,
              ERROR
            )

            // Update latent feature k of factor matrix 2
            transposedFactorMatrix2[k][j] = updateLatentFeature(
              latentFeatureB,
              latentFeatureA,
              ERROR
            )
          })
        }
      })
    })

    // Calculating totalError
    const TOTAL_ERROR = calculateError(
      ROW_COUNT,
      COLUMN_COUNT,
      TARGET_MATRIX,
      LATENT_FEATURES_COUNT,
      REGULARIZATION_RATE,
      factorMatrix1,
      transposedFactorMatrix2
    )

    // Complete factorization process if total error falls below a certain threshold
    if (TOTAL_ERROR < THRESHOLD) return
  })

  return [factorMatrix1, transpose(transposedFactorMatrix2)]
}

/**
 * Calculate total error of factor matrices
 *
 * @param {Number} ROW_COUNT
 * @param {Number} COLUMN_COUNT
 * @param {Array} TARGET_MATRIX
 * @param {Number} LATENT_FEATURES_COUNT
 * @param {Number} REGULARIZATION_RATE
 * @param {Array} factorMatrix1
 * @param {Array} transposedFactorMatrix2
 * @returns {Number}
 * @private
 */
function calculateError(
  ROW_COUNT: number,
  COLUMN_COUNT: number,
  TARGET_MATRIX: number[][],
  LATENT_FEATURES_COUNT: number,
  REGULARIZATION_RATE: number,
  factorMatrix1: number[][],
  transposedFactorMatrix2: number[][]
) {
  let totalError = 0

  doFor(ROW_COUNT, (i) => {
    doFor(COLUMN_COUNT, (j) => {
      // Get actual value on target matrix
      const TRUE_VALUE = TARGET_MATRIX[i][j]

      // Process non-empty values
      if (TRUE_VALUE > 0) {
        // Get difference of actual value and the current approximate value as error
        const CURRENT_VALUE = dotVectors(
          factorMatrix1[i],
          columnVector(transposedFactorMatrix2, j)
        )
        const ERROR = TRUE_VALUE - CURRENT_VALUE

        // Increment totalError with current error
        totalError = totalError + ERROR ** 2

        doFor(LATENT_FEATURES_COUNT, (k) => {
          totalError =
            totalError +
            (REGULARIZATION_RATE / 2) *
              (factorMatrix1[i][k] ** 2 + transposedFactorMatrix2[k][j] ** 2)
        })
      }
    })
  })

  return totalError
}

/**
 * Build completed matrix from matrix factors.
 *
 * @param {Array} factors Derived matrix factors
 * @returns {Array} Completed matrix
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
 * @param {Array} matrix Target matrix
 * @returns {Array} The transposed matrix
 * @private
 */
function transpose(matrix: number[][]) {
  const TRANSPOSED_ROW_COUNT = matrix[0].length
  const TRANSPOSED_COLUMN_COUNT = matrix.length
  const transposed = fillMatrix(
    TRANSPOSED_ROW_COUNT,
    TRANSPOSED_COLUMN_COUNT,
    () => 0
  )

  return transposed.map((t, i) => t.map((u, j) => matrix[j][i]))
}

/**
 * Gets the dot product of two matrices.
 *
 * @param {Array} m First matrix
 * @param {Array} n Second matrix
 * @returns {Array} Dot product of the two matrices
 * @private
 */
function matrixMultiply(m: number[][], n: number[][]) {
  const transposedN = transpose(n)

  return m.map((row) => transposedN.map((column) => dotVectors(row, column)))
}

/**
 * Gets the column vector at given index.
 *
 * @param {Array} matrix
 * @param {Number} index
 * @returns {Array}
 * @private
 */
function columnVector(matrix: number[][], index: number) {
  return matrix.map((m) => m[index])
}

/**
 * Multiplies vectors together and sums the resulting vector up.
 *
 * @param {Array} v
 * @param {Array} w
 * @returns {Number}
 * @private
 */
function dotVectors(v: number[], w: number[]) {
  return bimap(v, w, (x, y) => x * y).reduce((sum, x) => sum + x)
}

/**
 * Reduces two lists into one using the given function.
 *
 * @param {Array} a1
 * @param {Array} a2
 * @param {Function} fn A function that accepts two values and returns a single value
 * @returns A list which is a combination of the two lists
 * @private
 */
function bimap(
  a1: number[],
  a2: number[],
  fn: (x: number, y: number) => number
) {
  return a1.map((item, i) => fn(item, a2[i]))
}

/**
 * Creates an n x m matrix filled with the result of given fill function
 *
 * @param {Array} n Number of rows
 * @param {Array} m Number of columns
 * @param {Function} fill Function used to fill the matrix with
 * @returns {Array} The filled matrix
 * @private
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

/**
 * Execute given function n times.
 *
 * @param {Number} n Number of times to execute function
 * @param {Function} fn Function to execute
 * @private
 */
function doFor(n: number, fn: (i: number) => void) {
  let i = 0
  while (i < n) fn(i++)
}
