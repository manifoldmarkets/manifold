"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasChanges = exports.subtractObjects = exports.addObjects = exports.removeUndefinedProps = void 0;
const lodash_1 = require("lodash");
const removeUndefinedProps = (obj) => {
    const newObj = {};
    for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined)
            newObj[key] = obj[key];
    }
    return newObj;
};
exports.removeUndefinedProps = removeUndefinedProps;
const addObjects = (obj1, obj2) => {
    var _a, _b;
    const keys = (0, lodash_1.union)(Object.keys(obj1), Object.keys(obj2));
    const newObj = {};
    for (const key of keys) {
        newObj[key] = ((_a = obj1[key]) !== null && _a !== void 0 ? _a : 0) + ((_b = obj2[key]) !== null && _b !== void 0 ? _b : 0);
    }
    return newObj;
};
exports.addObjects = addObjects;
const subtractObjects = (obj1, obj2) => {
    var _a, _b;
    const keys = (0, lodash_1.union)(Object.keys(obj1), Object.keys(obj2));
    const newObj = {};
    for (const key of keys) {
        newObj[key] = ((_a = obj1[key]) !== null && _a !== void 0 ? _a : 0) - ((_b = obj2[key]) !== null && _b !== void 0 ? _b : 0);
    }
    return newObj;
};
exports.subtractObjects = subtractObjects;
const hasChanges = (obj, partial) => {
    const currValues = (0, lodash_1.mapValues)(partial, (_, key) => obj[key]);
    return !(0, lodash_1.isEqual)(currValues, partial);
};
exports.hasChanges = hasChanges;
//# sourceMappingURL=object.js.map