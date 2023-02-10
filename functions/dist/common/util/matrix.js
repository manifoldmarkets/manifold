"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dotProduct = exports.buildCompletedMatrix = exports.factorizeMatrix = void 0;
const lodash_1 = require("lodash");
// Code originally from: https://github.com/johnpaulada/matrix-factorization-js/blob/master/src/matrix-factorization.js
// Used to implement recommendations through collaborative filtering: https://towardsdatascience.com/recommender-systems-matrix-factorization-using-pytorch-bd52f46aa199
// See also: https://en.wikipedia.org/wiki/Matrix_factorization_(recommender_systems)
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
function factorizeMatrix(TARGET_MATRIX, columns, LATENT_FEATURES_COUNT = 5, ITERS = 5000, LEARNING_RATE = 0.0002, REGULARIZATION_RATE = 0.02, THRESHOLD = 0.001) {
    const columnToIndex = Object.fromEntries(columns.map((col, i) => [col, i]));
    const columnsOfRow = TARGET_MATRIX.map(Object.keys);
    const numPoints = (0, lodash_1.sumBy)(columnsOfRow, (row) => row.length);
    console.log('numPoints', numPoints);
    const FACTOR1_ROW_COUNT = TARGET_MATRIX.length;
    const FACTOR2_ROW_COUNT = columns.length;
    const initCell = () => (2 * Math.random()) / LATENT_FEATURES_COUNT;
    const factorMatrix1 = fillMatrix(FACTOR1_ROW_COUNT, LATENT_FEATURES_COUNT, initCell);
    const factorMatrix2 = fillMatrix(FACTOR2_ROW_COUNT, LATENT_FEATURES_COUNT, initCell);
    const updateLatentFeature = (latentFeatureA, latentFeatureB, error) => latentFeatureA +
        LEARNING_RATE *
            (2 * error * latentFeatureB - REGULARIZATION_RATE * latentFeatureA);
    // Iteratively figure out correct factors.
    for (let iter = 0; iter < ITERS; iter++) {
        for (let i = 0; i < TARGET_MATRIX.length; i++) {
            for (const column of columnsOfRow[i]) {
                // Get actual value on target matrix
                const TRUE_VALUE = TARGET_MATRIX[i][column];
                const j = columnToIndex[column];
                // Get difference of actual value and the current approximate value as error
                const CURRENT_VALUE = dotProduct(factorMatrix1[i], factorMatrix2[j]);
                const ERROR = TRUE_VALUE - CURRENT_VALUE;
                // Update factor matrices
                for (let k = 0; k < LATENT_FEATURES_COUNT; k++) {
                    const latentFeatureA = factorMatrix1[i][k];
                    const latentFeatureB = factorMatrix2[j][k];
                    // Update latent feature k of factor matrix 1
                    factorMatrix1[i][k] = updateLatentFeature(latentFeatureA, latentFeatureB, ERROR);
                    // Update latent feature k of factor matrix 2
                    factorMatrix2[j][k] = updateLatentFeature(latentFeatureB, latentFeatureA, ERROR);
                }
            }
        }
        if (iter % 50 === 0 || iter === ITERS - 1) {
            const TOTAL_ERROR = calculateFactorMatricesError(TARGET_MATRIX, columnToIndex, LATENT_FEATURES_COUNT, REGULARIZATION_RATE, factorMatrix1, factorMatrix2) / numPoints;
            console.log('iter', iter, 'error', TOTAL_ERROR);
            // Complete factorization process if total error falls below a certain threshold
            if (TOTAL_ERROR < THRESHOLD)
                break;
        }
    }
    return [factorMatrix1, factorMatrix2];
}
exports.factorizeMatrix = factorizeMatrix;
/**
 * Calculate total error of factor matrices
 */
function calculateFactorMatricesError(TARGET_MATRIX, columnToIndex, LATENT_FEATURES_COUNT, REGULARIZATION_RATE, factorMatrix1, factorMatrix2) {
    let totalError = 0;
    for (let i = 0; i < TARGET_MATRIX.length; i++) {
        const row = TARGET_MATRIX[i];
        for (const column of Object.keys(row)) {
            // Get actual value on target matrix
            const TRUE_VALUE = TARGET_MATRIX[i][column];
            const j = columnToIndex[column];
            // Get difference of actual value and the current approximate value as error
            const CURRENT_VALUE = dotProduct(factorMatrix1[i], factorMatrix2[j]);
            const ERROR = TRUE_VALUE - CURRENT_VALUE;
            // Increment totalError with current error
            totalError = totalError + ERROR ** 2;
            for (let k = 0; k < LATENT_FEATURES_COUNT; k++) {
                totalError =
                    totalError +
                        (REGULARIZATION_RATE / 2) *
                            (factorMatrix1[i][k] ** 2 + factorMatrix2[j][k] ** 2);
            }
        }
    }
    return totalError;
}
/**
 * Build completed matrix from matrix factors.
 */
function buildCompletedMatrix(factor1, factor2) {
    return multiplyMatrices(factor1, transpose(factor2));
}
exports.buildCompletedMatrix = buildCompletedMatrix;
function transpose(matrix) {
    return matrix[0].map((_, i) => matrix.map((row) => row[i]));
}
function multiplyMatrices(m, n) {
    const transposedN = transpose(n);
    return m.map((row) => transposedN.map((column) => dotProduct(row, column)));
}
/**
 * Multiplies vectors together and sums the resulting vector up.
 */
function dotProduct(v, w) {
    let sum = 0;
    for (let i = 0; i < v.length; i++)
        sum += v[i] * w[i];
    return sum;
}
exports.dotProduct = dotProduct;
/**
 * Creates an n x m matrix filled with the result of given fill function.
 */
function fillMatrix(n, m, fill = () => 0) {
    const matrix = [];
    for (let i = 0; i < n; i++) {
        matrix.push([]);
        for (let j = 0; j < m; j++) {
            matrix[i][j] = fill();
        }
    }
    return matrix;
}
//# sourceMappingURL=matrix.js.map