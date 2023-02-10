"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dividendcert = void 0;
const admin = require("firebase-admin");
const api_1 = require("./api");
const zod_1 = require("zod");
const cert_1 = require("../../common/calculate/cert");
const cert_txns_1 = require("./helpers/cert-txns");
const utils_1 = require("./utils");
// Split "amount" of mana between all holders of the cert.
const bodySchema = zod_1.z.object({
    certId: zod_1.z.string(),
    amount: zod_1.z.number(),
});
exports.dividendcert = (0, api_1.newEndpoint)({}, async (req, auth) => {
    return await firestore.runTransaction(async (transaction) => {
        var _a;
        const { certId, amount } = (0, api_1.validate)(bodySchema, req.body);
        // Get the cert, the provider, and all txns
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists) {
            throw new api_1.APIError(500, `User ${auth.uid} not found`);
        }
        const provider = userSnap.data();
        const certDoc = firestore.doc(`contracts/${certId}`);
        const certSnap = await transaction.get(certDoc);
        if (!certSnap.exists) {
            throw new api_1.APIError(500, `Cert ${certId} not found`);
        }
        const cert = certSnap.data();
        // For now, only allow cert creator to pay dividends
        if (cert.creatorId !== provider.id) {
            throw new api_1.APIError(500, `User ${provider.id} is not the creator of cert ${certId}`);
        }
        const txnsSnap = await firestore
            .collection('txns')
            .where('certId', '==', certId)
            .orderBy('createdTime', 'desc')
            .get();
        const txns = txnsSnap.docs.map((doc) => doc.data());
        const payouts = (0, cert_1.getDividendPayouts)(provider.id, amount, txns);
        // If the provider's balance would go negative, abort here
        const providerPayout = (_a = payouts.find((p) => p.userId === provider.id)) === null || _a === void 0 ? void 0 : _a.payout;
        if (!providerPayout) {
            throw new api_1.APIError(500, `Provider ${provider.id} must own a cert share`);
        }
        if (provider.balance + providerPayout < 0) {
            throw new api_1.APIError(500, `Insufficient balance; needed ${-providerPayout}`);
        }
        // Update user balances; assumes <249 owners of a cert
        // See `resolve-markets.ts` for a more robust solution
        (0, utils_1.payUsers)(transaction, payouts);
        // Also create the associated dividend txns
        const payoutsWithoutProvider = payouts.filter((p) => p.userId !== provider.id);
        (0, cert_txns_1.dividendTxns)(transaction, auth.uid, certId, payoutsWithoutProvider);
        return {
            payouts,
        };
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=dividend-cert.js.map