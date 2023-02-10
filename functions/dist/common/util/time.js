"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.WEEK_MS = exports.DAY_MS = exports.HOUR_MS = exports.MINUTE_MS = void 0;
exports.MINUTE_MS = 60 * 1000;
exports.HOUR_MS = 60 * exports.MINUTE_MS;
exports.DAY_MS = 24 * exports.HOUR_MS;
exports.WEEK_MS = 7 * exports.DAY_MS;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
//# sourceMappingURL=time.js.map