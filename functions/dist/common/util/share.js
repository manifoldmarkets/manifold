"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShareUrl = void 0;
const constants_1 = require("common/envs/constants");
const getShareUrl = (contract, username) => `https://${constants_1.ENV_CONFIG.domain}/${contract.creatorUsername}/${contract.slug}${username ? queryString(username) : ''}`;
exports.getShareUrl = getShareUrl;
const queryString = (username) => {
    try {
        return '?r=' + btoa(username).replace(/=/g, '');
    }
    catch (e) {
        return '?referrer=' + username;
    }
};
//# sourceMappingURL=share.js.map