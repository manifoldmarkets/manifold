"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAsync = exports.withRetries = exports.delay = void 0;
const delay = (ms) => {
    return new Promise((resolve) => setTimeout(() => resolve(), ms));
};
exports.delay = delay;
async function withRetries(q, policy) {
    var _a, _b;
    let err;
    let delaySec = (_a = policy === null || policy === void 0 ? void 0 : policy.initialBackoffSec) !== null && _a !== void 0 ? _a : 5;
    const maxRetries = (_b = policy === null || policy === void 0 ? void 0 : policy.retries) !== null && _b !== void 0 ? _b : 5;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await q;
        }
        catch (e) {
            err = e;
            if (i < maxRetries) {
                console.debug(`Error: ${err.message} - Retrying in ${delaySec}s.`);
                await (0, exports.delay)(delaySec * 1000);
                delaySec *= 2;
            }
        }
    }
    throw err;
}
exports.withRetries = withRetries;
const mapAsync = (items, f, maxConcurrentRequests = 100) => {
    let index = 0;
    let currRequests = 0;
    const results = [];
    // The following is a hack to fix a Node bug where the process exits before
    // the promise is resolved.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const intervalId = setInterval(() => { }, 10000);
    return new Promise((resolve, reject) => {
        const doWork = () => {
            while (index < items.length && currRequests < maxConcurrentRequests) {
                const itemIndex = index;
                f(items[itemIndex], itemIndex)
                    .then((data) => {
                    results[itemIndex] = data;
                    currRequests--;
                    if (index === items.length && currRequests === 0)
                        resolve(results);
                    else
                        doWork();
                })
                    .catch(reject);
                index++;
                currRequests++;
            }
        };
        if (items.length === 0)
            resolve([]);
        else
            doWork();
    }).finally(() => clearInterval(intervalId));
};
exports.mapAsync = mapAsync;
//# sourceMappingURL=promise.js.map