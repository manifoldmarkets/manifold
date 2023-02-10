"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelbet = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    betId: zod_1.z.string(),
});
exports.cancelbet = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { betId } = (0, api_1.validate)(bodySchema, req.body);
    return await firestore.runTransaction(async (trans) => {
        const snap = await trans.get(firestore.collectionGroup('bets').where('id', '==', betId));
        const betDoc = snap.docs[0];
        if (!(betDoc === null || betDoc === void 0 ? void 0 : betDoc.exists))
            throw new api_1.APIError(400, 'Bet not found.');
        const bet = betDoc.data();
        if (bet.userId !== auth.uid)
            throw new api_1.APIError(400, 'Not authorized to cancel bet.');
        if (bet.limitProb === undefined)
            throw new api_1.APIError(400, 'Not a limit order: Cannot cancel.');
        if (bet.isCancelled)
            throw new api_1.APIError(400, 'Bet already cancelled.');
        trans.update(betDoc.ref, { isCancelled: true });
        return Object.assign(Object.assign({}, bet), { isCancelled: true });
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=cancel-bet.js.map