"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.binarySearch = void 0;
function binarySearch(min, max, comparator) {
    let mid = 0;
    while (true) {
        mid = min + (max - min) / 2;
        // Break once we've reached max precision.
        if (mid === min || mid === max)
            break;
        const comparison = comparator(mid);
        if (comparison === 0)
            break;
        else if (comparison > 0) {
            max = mid;
        }
        else {
            min = mid;
        }
    }
    return mid;
}
exports.binarySearch = binarySearch;
//# sourceMappingURL=algos.js.map