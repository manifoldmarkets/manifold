"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimmanalink = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const manalink_1 = require("../../common/manalink");
const api_1 = require("./api");
const run_txn_1 = require("./run-txn");
const bodySchema = zod_1.z.object({
    slug: zod_1.z.string(),
});
exports.claimmanalink = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { slug } = (0, api_1.validate)(bodySchema, req.body);
    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
        var _a, _b;
        // Look up the manalink
        const manalinkDoc = firestore.doc(`manalinks/${slug}`);
        const manalinkSnap = await transaction.get(manalinkDoc);
        if (!manalinkSnap.exists) {
            throw new api_1.APIError(400, 'Manalink not found');
        }
        const manalink = manalinkSnap.data();
        const { amount, fromId, claimedUserIds } = manalink;
        if (amount <= 0 || isNaN(amount) || !isFinite(amount))
            throw new api_1.APIError(500, 'Invalid amount');
        if (auth.uid === fromId)
            throw new api_1.APIError(400, `You can't claim your own manalink`);
        const fromDoc = firestore.doc(`users/${fromId}`);
        const fromSnap = await transaction.get(fromDoc);
        if (!fromSnap.exists) {
            throw new api_1.APIError(500, `User ${fromId} not found`);
        }
        const fromUser = fromSnap.data();
        if (!(0, manalink_1.canCreateManalink)(fromUser)) {
            throw new api_1.APIError(400, `@${fromUser.username} is not authorized to create manalinks.`);
        }
        // Only permit one redemption per user per link
        if (claimedUserIds.includes(auth.uid)) {
            throw new api_1.APIError(400, `You already redeemed manalink ${slug}`);
        }
        // Disallow expired or maxed out links
        if (manalink.expiresTime != null && manalink.expiresTime < Date.now()) {
            throw new api_1.APIError(400, `Manalink ${slug} expired on ${new Date(manalink.expiresTime).toLocaleString()}`);
        }
        if (manalink.maxUses != null &&
            manalink.maxUses <= manalink.claims.length) {
            throw new api_1.APIError(400, `Manalink ${slug} has reached its max uses of ${manalink.maxUses}`);
        }
        if (fromUser.balance < amount) {
            throw new api_1.APIError(400, `Insufficient balance: ${fromUser.name} needed ${amount} for this manalink but only had ${fromUser.balance} `);
        }
        // Actually execute the txn
        const data = {
            fromId,
            fromType: 'USER',
            toId: auth.uid,
            toType: 'USER',
            amount,
            token: 'M$',
            category: 'MANALINK',
            description: `Manalink ${slug} claimed: ${amount} from ${fromUser.username} to ${auth.uid}`,
        };
        const result = await (0, run_txn_1.runTxn)(transaction, data);
        const txnId = (_a = result.txn) === null || _a === void 0 ? void 0 : _a.id;
        if (!txnId) {
            throw new api_1.APIError(500, (_b = result.message) !== null && _b !== void 0 ? _b : 'An error occurred posting the transaction.');
        }
        // Update the manalink object with this info
        const claim = {
            toId: auth.uid,
            txnId,
            claimedTime: Date.now(),
        };
        transaction.update(manalinkDoc, {
            claimedUserIds: [...claimedUserIds, auth.uid],
            claims: [...manalink.claims, claim],
        });
        return { message: 'Manalink claimed' };
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=claim-manalink.js.map