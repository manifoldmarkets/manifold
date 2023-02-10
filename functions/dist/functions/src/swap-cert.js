"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swapcert = void 0;
const admin = require("firebase-admin");
const api_1 = require("./api");
const zod_1 = require("zod");
const uniswap2_1 = require("../../common/calculate/uniswap2");
const cert_txns_1 = require("./helpers/cert-txns");
const cert_1 = require("../../common/calculate/cert");
const bodySchema = zod_1.z.object({
    certId: zod_1.z.string(),
    amount: zod_1.z.number(),
    // Assumes 'M$' for now.
    // token: z.enum(['SHARE', 'M$']),
});
exports.swapcert = (0, api_1.newEndpoint)({}, async (req, auth) => {
    return await firestore.runTransaction(async (transaction) => {
        var _a;
        const { certId, amount } = (0, api_1.validate)(bodySchema, req.body);
        // Get the cert and the doc
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists) {
            throw new api_1.APIError(500, `User ${auth.uid} not found`);
        }
        const user = userSnap.data();
        const certDoc = firestore.doc(`contracts/${certId}`);
        const certSnap = await transaction.get(certDoc);
        if (!certSnap.exists) {
            throw new api_1.APIError(500, `Cert ${certId} not found`);
        }
        const cert = certSnap.data();
        // Ensure that the user has enough mana left; then update the user doc
        const newBalance = user.balance - amount;
        if (newBalance < 0) {
            throw new api_1.APIError(500, `Insufficient balance`);
        }
        transaction.update(userDoc, { balance: newBalance });
        // Recalculate the pool and update the cert doc
        const newPool = (0, uniswap2_1.afterSwap)(cert.pool, 'M$', amount);
        transaction.update(certDoc, {
            pool: newPool,
            lastUpdatedTime: Date.now(),
            lastBetTime: Date.now(),
        });
        const sharesFromPool = cert.pool['SHARE'] - newPool['SHARE'];
        // Right now, we support negative values in the amount to sell shares
        // TODO: Not sure if we should support negative balances in CertTxn...
        const txnsSnap = await firestore
            .collection('txns')
            .where('certId', '==', certId)
            .orderBy('createdTime', 'desc')
            .get();
        const txns = txnsSnap.docs.map((doc) => doc.data());
        const owners = (0, cert_1.getCertOwnershipUsers)(cert.creatorId, txns);
        // If negative sharesSold (aka adding shares to pool), make sure the user has enough
        const sharesOwned = (_a = owners[user.id]) !== null && _a !== void 0 ? _a : 0;
        if (sharesFromPool < 0 && sharesOwned < -sharesFromPool) {
            throw new api_1.APIError(500, `Insufficient shares: needed ${-sharesFromPool} but had ${owners[user.id]}`);
        }
        // Create the two txns for this swap
        (0, cert_txns_1.buyFromPool)(user.id, cert.id, sharesFromPool, amount, transaction);
        return {
            newPool: newPool,
        };
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=swap-cert.js.map