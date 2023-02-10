"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupConsecutive = exports.buildArray = exports.filterDefined = void 0;
const lodash_1 = require("lodash");
function filterDefined(array) {
    return array.filter((item) => item !== null && item !== undefined);
}
exports.filterDefined = filterDefined;
function buildArray(...params) {
    return (0, lodash_1.compact)((0, lodash_1.flattenDeep)(params));
}
exports.buildArray = buildArray;
function groupConsecutive(xs, key) {
    if (!xs.length) {
        return [];
    }
    const result = [];
    let curr = { key: key(xs[0]), items: [xs[0]] };
    for (const x of xs.slice(1)) {
        const k = key(x);
        if (!(0, lodash_1.isEqual)(k, curr.key)) {
            result.push(curr);
            curr = { key: k, items: [x] };
        }
        else {
            curr.items.push(x);
        }
    }
    result.push(curr);
    return result;
}
exports.groupConsecutive = groupConsecutive;
//# sourceMappingURL=array.js.map