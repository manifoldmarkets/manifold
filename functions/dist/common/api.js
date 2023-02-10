"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFunctionUrl = exports.APIError = void 0;
const constants_1 = require("./envs/constants");
class APIError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.name = 'APIError';
        this.details = details;
    }
}
exports.APIError = APIError;
function getFunctionUrl(name) {
    if (process.env.NEXT_PUBLIC_FUNCTIONS_URL) {
        return `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/${name}`;
    }
    else if (process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
        const { projectId, region } = constants_1.ENV_CONFIG.firebaseConfig;
        return `http://localhost:5001/${projectId}/${region}/${name}`;
    }
    else {
        const { cloudRunId, cloudRunRegion } = constants_1.ENV_CONFIG;
        return `https://${name}-${cloudRunId}-${cloudRunRegion}.a.run.app`;
    }
}
exports.getFunctionUrl = getFunctionUrl;
//# sourceMappingURL=api.js.map