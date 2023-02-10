"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awardcommentbounty = exports.addcommentbounty = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const object_1 = require("../../common/util/object");
const api_1 = require("./api");
const antes_1 = require("../../common/antes");
const utils_1 = require("./utils");
const transact_1 = require("./transact");
const create_notification_1 = require("./create-notification");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    amount: zod_1.z.number().gt(0),
});
const awardBodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    commentId: zod_1.z.string(),
    amount: zod_1.z.number().gt(0),
});
exports.addcommentbounty = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { amount, contractId } = (0, api_1.validate)(bodySchema, req.body);
    if (!isFinite(amount))
        throw new api_1.APIError(400, 'Invalid amount');
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
        var _a;
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found');
        const user = userSnap.data();
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const contractSnap = await transaction.get(contractDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Invalid contract');
        const contract = contractSnap.data();
        if (user.balance < amount)
            throw new api_1.APIError(400, 'Insufficient user balance');
        const newCommentBountyTxn = {
            fromId: user.id,
            fromType: 'USER',
            toId: (0, utils_1.isProd)()
                ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
                : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
            toType: 'BANK',
            amount,
            token: 'M$',
            category: 'COMMENT_BOUNTY',
            data: {
                contractId,
            },
            description: `Deposit M$${amount} from ${user.id} for comment bounty for contract ${contractId}`,
        };
        const result = await (0, transact_1.runTxn)(transaction, newCommentBountyTxn);
        transaction.update(contractDoc, (0, object_1.removeUndefinedProps)({
            openCommentBounties: ((_a = contract.openCommentBounties) !== null && _a !== void 0 ? _a : 0) + amount,
        }));
        return result;
    });
});
exports.awardcommentbounty = (0, api_1.newEndpoint)({}, async (req, auth) => {
    var _a;
    const { amount, commentId, contractId } = (0, api_1.validate)(awardBodySchema, req.body);
    if (!isFinite(amount))
        throw new api_1.APIError(400, 'Invalid amount');
    // run as transaction to prevent race conditions
    const res = await firestore.runTransaction(async (transaction) => {
        var _a, _b;
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found');
        const user = userSnap.data();
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const contractSnap = await transaction.get(contractDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Invalid contract');
        const contract = contractSnap.data();
        if (user.id !== contract.creatorId)
            throw new api_1.APIError(400, 'Only contract creator can award comment bounties');
        const commentDoc = firestore.doc(`contracts/${contractId}/comments/${commentId}`);
        const commentSnap = await transaction.get(commentDoc);
        if (!commentSnap.exists)
            throw new api_1.APIError(400, 'Invalid comment');
        const comment = commentSnap.data();
        const amountAvailable = (_a = contract.openCommentBounties) !== null && _a !== void 0 ? _a : 0;
        if (amountAvailable < amount)
            throw new api_1.APIError(400, 'Insufficient open bounty balance');
        const newCommentBountyTxn = {
            fromId: (0, utils_1.isProd)()
                ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
                : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
            fromType: 'BANK',
            toId: comment.userId,
            toType: 'USER',
            amount,
            token: 'M$',
            category: 'COMMENT_BOUNTY',
            data: {
                contractId,
                commentId,
            },
            description: `Withdrawal M$${amount} from BANK for comment ${comment.id} bounty for contract ${contractId}`,
        };
        const result = await (0, transact_1.runTxn)(transaction, newCommentBountyTxn);
        await transaction.update(contractDoc, (0, object_1.removeUndefinedProps)({
            openCommentBounties: amountAvailable - amount,
        }));
        await transaction.update(commentDoc, (0, object_1.removeUndefinedProps)({
            bountiesAwarded: ((_b = comment.bountiesAwarded) !== null && _b !== void 0 ? _b : 0) + amount,
        }));
        return Object.assign(Object.assign({}, result), { comment, contract, user });
    });
    if ((_a = res.txn) === null || _a === void 0 ? void 0 : _a.id) {
        const { comment, contract, user } = res;
        await (0, create_notification_1.createBountyNotification)(user, comment.userId, amount, res.txn.id, contract, comment.id);
    }
    return res;
});
const firestore = admin.firestore();
//# sourceMappingURL=update-comment-bounty.js.map