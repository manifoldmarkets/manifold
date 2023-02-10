"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createanswer = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const new_bet_1 = require("../../common/new-bet");
const answer_1 = require("../../common/answer");
const utils_1 = require("./utils");
const api_1 = require("./api");
const follow_market_1 = require("./follow-market");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string().max(answer_1.MAX_ANSWER_LENGTH),
    amount: zod_1.z.number().gt(0),
    text: zod_1.z.string(),
});
const opts = { secrets: ['MAILGUN_KEY'] };
exports.createanswer = (0, api_1.newEndpoint)(opts, async (req, auth) => {
    const { contractId, amount, text } = (0, api_1.validate)(bodySchema, req.body);
    if (!isFinite(amount))
        throw new api_1.APIError(400, 'Invalid amount');
    // Run as transaction to prevent race conditions.
    const answer = await firestore.runTransaction(async (transaction) => {
        var _a;
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found');
        const user = userSnap.data();
        if (user.balance < amount)
            throw new api_1.APIError(400, 'Insufficient balance');
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const contractSnap = await transaction.get(contractDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Invalid contract');
        const contract = contractSnap.data();
        if (contract.outcomeType !== 'FREE_RESPONSE')
            throw new api_1.APIError(400, 'Requires a free response contract');
        const { closeTime, volume } = contract;
        if (closeTime && Date.now() > closeTime)
            throw new api_1.APIError(400, 'Trading is closed');
        const [lastAnswer] = await (0, utils_1.getValues)(firestore
            .collection(`contracts/${contractId}/answers`)
            .orderBy('number', 'desc')
            .limit(1));
        if (!lastAnswer)
            throw new api_1.APIError(500, 'Could not fetch last answer');
        const number = lastAnswer.number + 1;
        const id = `${number}`;
        const newAnswerDoc = firestore
            .collection(`contracts/${contractId}/answers`)
            .doc(id);
        const answerId = newAnswerDoc.id;
        const { username, name, avatarUrl } = user;
        const answer = {
            id,
            number,
            contractId,
            createdTime: Date.now(),
            userId: user.id,
            username,
            name,
            avatarUrl,
            text,
        };
        transaction.create(newAnswerDoc, answer);
        const { newBet, newPool, newTotalShares, newTotalBets } = (0, new_bet_1.getNewMultiBetInfo)(answerId, amount, contract);
        const newBalance = user.balance - amount;
        const betDoc = firestore.collection(`contracts/${contractId}/bets`).doc();
        transaction.create(betDoc, Object.assign({ id: betDoc.id, userId: user.id }, newBet));
        transaction.update(userDoc, { balance: newBalance });
        transaction.update(contractDoc, {
            pool: newPool,
            totalShares: newTotalShares,
            totalBets: newTotalBets,
            answers: [...((_a = contract.answers) !== null && _a !== void 0 ? _a : []), answer],
            volume: volume + amount,
        });
        return answer;
    });
    await (0, follow_market_1.addUserToContractFollowers)(contractId, auth.uid);
    return answer;
});
const firestore = admin.firestore();
//# sourceMappingURL=create-answer.js.map