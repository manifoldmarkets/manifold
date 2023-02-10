"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chooseRandomSubset = exports.shuffle = exports.createRNG = exports.genHash = exports.randomString = void 0;
const randomString = (length = 12) => Math.random()
    .toString(16)
    .substring(2, length + 2);
exports.randomString = randomString;
function genHash(str) {
    // xmur3
    // Route around compiler bug by using object?
    const o = { h: 1779033703 ^ str.length };
    for (let i = 0; i < str.length; i++) {
        let h = o.h;
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
        o.h = h;
    }
    return function () {
        let h = o.h;
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}
exports.genHash = genHash;
function createRNG(seed) {
    // https://stackoverflow.com/a/47593316/1592933
    const gen = genHash(seed);
    let [a, b, c, d] = [gen(), gen(), gen(), gen()];
    // sfc32
    return function () {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}
exports.createRNG = createRNG;
const shuffle = (array, rand) => {
    for (let i = 0; i < array.length; i++) {
        const swapIndex = i + Math.floor(rand() * (array.length - i));
        [array[i], array[swapIndex]] = [array[swapIndex], array[i]];
    }
};
exports.shuffle = shuffle;
function chooseRandomSubset(items, count, seed) {
    const fiveMinutes = 5 * 60 * 1000;
    seed = seed !== null && seed !== void 0 ? seed : Math.round(Date.now() / fiveMinutes).toString();
    const copy = [...items];
    (0, exports.shuffle)(copy, createRNG(seed));
    return copy.slice(0, count);
}
exports.chooseRandomSubset = chooseRandomSubset;
//# sourceMappingURL=random.js.map