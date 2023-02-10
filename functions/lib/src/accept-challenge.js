"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptchallenge = void 0;
const zod_1 = require("zod");
const api_1 = require("./api");
const utils_1 = require("./utils");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const object_1 = require("../../common/util/object");
const create_notification_1 = require("./create-notification");
const fees_1 = require("../../common/fees");
const format_1 = require("../../common/util/format");
const redeem_shares_1 = require("./redeem-shares");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    challengeSlug: zod_1.z.string(),
    outcomeType: zod_1.z.literal('BINARY'),
    closeTime: zod_1.z.number().gte(Date.now()),
});
const firestore = admin.firestore();
exports.acceptchallenge = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { challengeSlug, contractId } = (0, api_1.validate)(bodySchema, req.body);
    const result = await firestore.runTransaction(async (trans) => {
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const challengeDoc = firestore.doc(`contracts/${contractId}/challenges/${challengeSlug}`);
        const [contractSnap, userSnap, challengeSnap] = await trans.getAll(contractDoc, userDoc, challengeDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract not found.');
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        if (!challengeSnap.exists)
            throw new api_1.APIError(400, 'Challenge not found.');
        const anyContract = contractSnap.data();
        const user = userSnap.data();
        const challenge = challengeSnap.data();
        if (challenge.acceptances.length > 0)
            throw new api_1.APIError(400, 'Challenge already accepted.');
        const creatorDoc = firestore.doc(`users/${challenge.creatorId}`);
        const creatorSnap = await trans.get(creatorDoc);
        if (!creatorSnap.exists)
            throw new api_1.APIError(400, 'Creator not found.');
        const creator = creatorSnap.data();
        const { creatorAmount, acceptorOutcome, creatorOutcome, creatorOutcomeProb, acceptorAmount, } = challenge;
        if (user.balance < acceptorAmount)
            throw new api_1.APIError(400, 'Insufficient balance.');
        if (creator.balance < creatorAmount)
            throw new api_1.APIError(400, 'Creator has insufficient balance.');
        const contract = anyContract;
        const shares = (1 / creatorOutcomeProb) * creatorAmount;
        const createdTime = Date.now();
        const probOfYes = creatorOutcome === 'YES' ? creatorOutcomeProb : 1 - creatorOutcomeProb;
        (0, utils_1.log)('Creating challenge bet for', user.username, shares, acceptorOutcome, 'shares', 'at', (0, format_1.formatPercent)(creatorOutcomeProb), 'for', (0, format_1.formatMoney)(acceptorAmount));
        const yourNewBet = (0, object_1.removeUndefinedProps)({
            orderAmount: acceptorAmount,
            amount: acceptorAmount,
            shares,
            isCancelled: false,
            contractId: contract.id,
            outcome: acceptorOutcome,
            probBefore: probOfYes,
            probAfter: probOfYes,
            loanAmount: 0,
            createdTime,
            fees: fees_1.noFees,
            challengeSlug: challenge.slug,
            isAnte: false,
            isRedemption: false,
            isChallenge: true,
        });
        const yourNewBetDoc = contractDoc.collection('bets').doc();
        trans.create(yourNewBetDoc, Object.assign({ id: yourNewBetDoc.id, userId: user.id }, yourNewBet));
        trans.update(userDoc, { balance: firestore_1.FieldValue.increment(-yourNewBet.amount) });
        const creatorNewBet = (0, object_1.removeUndefinedProps)({
            orderAmount: creatorAmount,
            amount: creatorAmount,
            shares,
            isCancelled: false,
            contractId: contract.id,
            outcome: creatorOutcome,
            probBefore: probOfYes,
            probAfter: probOfYes,
            loanAmount: 0,
            createdTime,
            fees: fees_1.noFees,
            challengeSlug: challenge.slug,
            isAnte: false,
            isRedemption: false,
            isChallenge: true,
        });
        const creatorBetDoc = contractDoc.collection('bets').doc();
        trans.create(creatorBetDoc, Object.assign({ id: creatorBetDoc.id, userId: creator.id }, creatorNewBet));
        trans.update(creatorDoc, {
            balance: firestore_1.FieldValue.increment(-creatorNewBet.amount),
        });
        const volume = contract.volume + yourNewBet.amount + creatorNewBet.amount;
        trans.update(contractDoc, { volume });
        trans.update(challengeDoc, (0, object_1.removeUndefinedProps)({
            acceptedByUserIds: [user.id],
            acceptances: [
                {
                    userId: user.id,
                    betId: yourNewBetDoc.id,
                    createdTime,
                    amount: acceptorAmount,
                    userUsername: user.username,
                    userName: user.name,
                    userAvatarUrl: user.avatarUrl,
                },
            ],
        }));
        await (0, create_notification_1.createChallengeAcceptedNotification)(user, creator, challenge, acceptorAmount, contract);
        (0, utils_1.log)('Done, sent notification.');
        return { bet: yourNewBetDoc, contract };
    });
    const { bet, contract } = result;
    await (0, redeem_shares_1.redeemShares)(auth.uid, contract);
    return { betId: bet.id };
});
//# sourceMappingURL=accept-challenge.js.map