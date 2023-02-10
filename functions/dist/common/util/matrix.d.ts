/**
 * Gets the factors of a sparse matrix
 *
 * @param TARGET_MATRIX target matrix, where each row specifies a subset of all columns.
 * @param columns All column names of the target matrix
 * @param LATENT_FEATURES_COUNT Number of latent features
 * @param ITERS Number of times to move towards the real factors
 * @param LEARNING_RATE Learning rate
 * @param REGULARIZATION_RATE Regularization amount, i.e. amount of bias reduction
 * @returns An array containing the two factor matrices
 */
export declare function factorizeMatrix(TARGET_MATRIX: {
    [column: string]: number;
}[], columns: string[], LATENT_FEATURES_COUNT?: number, ITERS?: number, LEARNING_RATE?: number, REGULARIZATION_RATE?: number, THRESHOLD?: number): number[][][];
/**
 * Build completed matrix from matrix factors.
 */
export declare function buildCompletedMatrix(factor1: number[][], factor2: number[][]): number[][];
/**
 * Multiplies vectors together and sums the resulting vector up.
 */
export declare function dotProduct(v: number[], w: number[]): number;
