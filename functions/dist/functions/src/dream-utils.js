"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dreamWithDefaultParams = void 0;
const node_fetch_1 = require("node-fetch");
const constants_1 = require("../../common/envs/constants");
const dreamWithDefaultParams = async (input) => {
    try {
        const API_KEY = process.env.DREAM_KEY;
        const MODIFIERS = '8k, beautiful, illustration, trending on art station, picture of the day, epic composition, without any text in the picture';
        const data = {
            prompt: input + ', ' + MODIFIERS,
            apiKey: API_KEY,
        };
        const response = await (0, node_fetch_1.default)(`https://${constants_1.DOMAIN}/api/v0/dream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const json = await response.json();
        return json.url;
    }
    catch (e) {
        console.log('Error dreaming cover image: ', e);
        return undefined;
    }
};
exports.dreamWithDefaultParams = dreamWithDefaultParams;
//# sourceMappingURL=dream-utils.js.map