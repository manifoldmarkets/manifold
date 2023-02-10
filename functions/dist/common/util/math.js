"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.floatingLesserEqual = exports.floatingGreaterEqual = exports.floatingEqual = exports.average = exports.median = exports.TAU = exports.normpdf = exports.logInterpolation = void 0;
const lodash_1 = require("lodash");
const logInterpolation = (min, max, value) => {
    if (value <= min)
        return 0;
    if (value >= max)
        return 1;
    return Math.log(value - min + 1) / Math.log(max - min + 1);
};
exports.logInterpolation = logInterpolation;
function normpdf(x, mean = 0, variance = 1) {
    if (variance === 0) {
        return x === mean ? Infinity : 0;
    }
    return (Math.exp((-0.5 * Math.pow(x - mean, 2)) / variance) /
        Math.sqrt(exports.TAU * variance));
}
exports.normpdf = normpdf;
exports.TAU = Math.PI * 2;
function median(xs) {
    if (xs.length === 0)
        return NaN;
    const sorted = (0, lodash_1.sortBy)(xs, (x) => x);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}
exports.median = median;
function average(xs) {
    return (0, lodash_1.sum)(xs) / xs.length;
}
exports.average = average;
const EPSILON = 0.00000001;
function floatingEqual(a, b, epsilon = EPSILON) {
    return Math.abs(a - b) < epsilon;
}
exports.floatingEqual = floatingEqual;
function floatingGreaterEqual(a, b, epsilon = EPSILON) {
    return a + epsilon >= b;
}
exports.floatingGreaterEqual = floatingGreaterEqual;
function floatingLesserEqual(a, b, epsilon = EPSILON) {
    return a - epsilon <= b;
}
exports.floatingLesserEqual = floatingLesserEqual;
//# sourceMappingURL=math.js.map