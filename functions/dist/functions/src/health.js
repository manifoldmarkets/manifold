"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.health = void 0;
const api_1 = require("./api");
exports.health = (0, api_1.newEndpoint)({ method: 'GET' }, async (_req, auth) => {
    return {
        message: 'Server is working.',
        uid: auth.uid,
    };
});
//# sourceMappingURL=health.js.map