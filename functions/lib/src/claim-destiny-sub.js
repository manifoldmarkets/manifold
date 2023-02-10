"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimdestinysub = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const node_fetch_1 = require("node-fetch");
const firestore_1 = require("firebase-admin/firestore");
const api_1 = require("./api");
const destiny_sub_1 = require("../../common/destiny-sub");
const bodySchema = zod_1.z.object({
    destinyUsername: zod_1.z.string().trim().min(1),
});
exports.claimdestinysub = (0, api_1.newEndpoint)({ secrets: ['DESTINY_API_KEY'] }, async (req, auth) => {
    const { destinyUsername } = (0, api_1.validate)(bodySchema, req.body);
    return await firestore.runTransaction(async (trans) => {
        var _a;
        const privateSnap = await trans.get(firestore.collection('private-users').doc(auth.uid));
        if (!privateSnap.exists)
            throw new api_1.APIError(400, 'Private user not found.');
        const privateUser = privateSnap.data();
        if (privateUser.destinySubClaimed)
            throw new api_1.APIError(400, 'Destiny sub already claimed.');
        const userSnap = await trans.get(firestore.collection('users').doc(auth.uid));
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        const user = userSnap.data();
        if (user.balance < destiny_sub_1.DESTINY_SUB_COST)
            throw new api_1.APIError(400, 'Insufficient balance.');
        const response = await (0, node_fetch_1.default)('https://www.destiny.gg/api/mm/award-sub?privatekey=' +
            process.env.DESTINY_API_KEY, {
            method: 'post',
            body: JSON.stringify({ username: destinyUsername }),
            headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        const destinySubId = (_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.newSubId;
        if (!destinySubId) {
            throw new api_1.APIError(400, 'Error claiming Destiny sub: ' + (result === null || result === void 0 ? void 0 : result.message));
        }
        const subDoc = firestore.collection('destiny-subs').doc();
        const sub = {
            id: subDoc.id,
            createdTime: Date.now(),
            destinySubId,
            cost: destiny_sub_1.DESTINY_SUB_COST,
            userId: user.id,
            username: user.username,
            destinyUsername,
        };
        trans.create(subDoc, sub);
        trans.update(userSnap.ref, {
            balance: firestore_1.FieldValue.increment(-destiny_sub_1.DESTINY_SUB_COST),
            totalDeposits: firestore_1.FieldValue.increment(-destiny_sub_1.DESTINY_SUB_COST),
        });
        trans.update(privateSnap.ref, { destinySubClaimed: true });
        return { success: true };
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=claim-destiny-sub.js.map