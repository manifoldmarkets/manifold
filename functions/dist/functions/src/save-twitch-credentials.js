"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savetwitchcredentials = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    twitchInfo: zod_1.z.object({
        twitchName: zod_1.z.string(),
        controlToken: zod_1.z.string(),
    }),
});
exports.savetwitchcredentials = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { twitchInfo } = (0, api_1.validate)(bodySchema, req.body);
    const userId = auth.uid;
    await firestore.doc(`private-users/${userId}`).update({ twitchInfo });
    return { success: true };
});
const firestore = admin.firestore();
//# sourceMappingURL=save-twitch-credentials.js.map