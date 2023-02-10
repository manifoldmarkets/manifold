"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateCommentOnContract = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const calculate_1 = require("../../common/calculate");
const create_notification_1 = require("./create-notification");
const parse_1 = require("../../common/util/parse");
const follow_market_1 = require("./follow-market");
const firestore = admin.firestore();
function getMostRecentCommentableBet(before, betsByCurrentUser, commentsByCurrentUser, answerOutcome) {
    let sortedBetsByCurrentUser = betsByCurrentUser.sort((a, b) => b.createdTime - a.createdTime);
    if (answerOutcome) {
        sortedBetsByCurrentUser = sortedBetsByCurrentUser.slice(0, 1);
    }
    return sortedBetsByCurrentUser
        .filter((bet) => {
        const { createdTime, isRedemption } = bet;
        // You can comment on bets posted in the last hour
        const commentable = !isRedemption && before - createdTime < 60 * 60 * 1000;
        const alreadyCommented = commentsByCurrentUser.some((comment) => comment.createdTime > bet.createdTime);
        if (commentable && !alreadyCommented) {
            if (!answerOutcome)
                return true;
            return answerOutcome === bet.outcome;
        }
        return false;
    })
        .pop();
}
async function getPriorUserComments(contractId, userId, before) {
    const priorCommentsQuery = await firestore
        .collection('contracts')
        .doc(contractId)
        .collection('comments')
        .where('createdTime', '<', before)
        .where('userId', '==', userId)
        .get();
    return priorCommentsQuery.docs.map((d) => d.data());
}
async function getPriorContractBets(contractId, userId, before) {
    const priorBetsQuery = await firestore
        .collection('contracts')
        .doc(contractId)
        .collection('bets')
        .where('createdTime', '<', before)
        .where('userId', '==', userId)
        .where('isAnte', '==', false)
        .get();
    return priorBetsQuery.docs.map((d) => d.data());
}
exports.onCreateCommentOnContract = functions
    .runWith({ memory: '4GB', timeoutSeconds: 540 })
    .runWith({ secrets: ['MAILGUN_KEY', 'API_SECRET'] })
    .firestore.document('contracts/{contractId}/comments/{commentId}')
    .onCreate(async (change, context) => {
    const { contractId } = context.params;
    const { eventId } = context;
    const contract = await (0, utils_1.getContract)(contractId);
    if (!contract)
        throw new Error('Could not find contract corresponding with comment');
    await change.ref.update({
        contractSlug: contract.slug,
        contractQuestion: contract.question,
    });
    await (0, utils_1.revalidateStaticProps)((0, utils_1.getContractPath)(contract));
    const comment = change.data();
    const lastCommentTime = comment.createdTime;
    const commentCreator = await (0, utils_1.getUser)(comment.userId);
    if (!commentCreator)
        throw new Error('Could not find comment creator');
    await (0, follow_market_1.addUserToContractFollowers)(contract.id, commentCreator.id);
    await firestore
        .collection('contracts')
        .doc(contract.id)
        .update({ lastCommentTime, lastUpdatedTime: Date.now() });
    const priorUserBets = await getPriorContractBets(contractId, comment.userId, comment.createdTime);
    const priorUserComments = await getPriorUserComments(contractId, comment.userId, comment.createdTime);
    const bet = getMostRecentCommentableBet(comment.createdTime, priorUserBets, priorUserComments, comment.answerOutcome);
    if (bet) {
        await change.ref.update({
            betId: bet.id,
            betOutcome: bet.outcome,
            betAmount: bet.amount,
        });
    }
    const position = (0, calculate_1.getLargestPosition)(contract, priorUserBets);
    if (position) {
        const fields = {
            commenterPositionShares: position.shares,
            commenterPositionOutcome: position.outcome,
        };
        if (contract.mechanism === 'cpmm-1') {
            fields.commenterPositionProb = contract.prob;
        }
        await change.ref.update(fields);
    }
    await handleCommentNotifications(comment, contract, commentCreator, bet, eventId);
});
const getReplyInfo = async (comment, contract) => {
    var _a;
    if (comment.answerOutcome &&
        contract.outcomeType === 'FREE_RESPONSE' &&
        contract.answers) {
        const comments = await (0, utils_1.getValues)(firestore.collection('contracts').doc(contract.id).collection('comments'));
        const answer = contract.answers.find((a) => a.id === comment.answerOutcome);
        return {
            repliedToAnswer: answer,
            repliedToType: 'answer',
            repliedUserId: answer === null || answer === void 0 ? void 0 : answer.userId,
            commentsInSameReplyChain: comments.filter((c) => c.answerOutcome === (answer === null || answer === void 0 ? void 0 : answer.id)),
        };
    }
    else if (comment.replyToCommentId) {
        const comments = await (0, utils_1.getValues)(firestore.collection('contracts').doc(contract.id).collection('comments'));
        return {
            repliedToAnswer: null,
            repliedToType: 'comment',
            repliedUserId: (_a = comments.find((c) => c.id === comment.replyToCommentId)) === null || _a === void 0 ? void 0 : _a.userId,
            commentsInSameReplyChain: comments.filter((c) => c.replyToCommentId === comment.replyToCommentId),
        };
    }
    else {
        return null;
    }
};
const handleCommentNotifications = async (comment, contract, commentCreator, bet, eventId) => {
    const replyInfo = await getReplyInfo(comment, contract);
    const mentionedUsers = (0, lodash_1.compact)((0, parse_1.parseMentions)(comment.content));
    const repliedUsers = {};
    if (replyInfo) {
        const { repliedToType, repliedUserId, repliedToAnswer, commentsInSameReplyChain, } = replyInfo;
        // The parent of the reply chain could be a comment or an answer
        if (repliedUserId && repliedToType)
            repliedUsers[repliedUserId] = {
                repliedToType,
                repliedToAnswerText: repliedToAnswer === null || repliedToAnswer === void 0 ? void 0 : repliedToAnswer.text,
                repliedToId: comment.replyToCommentId || (repliedToAnswer === null || repliedToAnswer === void 0 ? void 0 : repliedToAnswer.id),
                bet: bet,
            };
        if (commentsInSameReplyChain) {
            // The rest of the children in the chain are always comments
            commentsInSameReplyChain.forEach((c) => {
                if (c.userId !== comment.userId && c.userId !== repliedUserId) {
                    repliedUsers[c.userId] = {
                        repliedToType: 'comment',
                        repliedToAnswerText: undefined,
                        repliedToId: c.id,
                        bet: undefined,
                    };
                }
            });
        }
    }
    await (0, create_notification_1.createCommentOrAnswerOrUpdatedContractNotification)(comment.id, 'comment', 'created', commentCreator, eventId, (0, parse_1.richTextToString)(comment.content), contract, {
        repliedUsersInfo: repliedUsers,
        taggedUserIds: mentionedUsers,
    });
};
//# sourceMappingURL=on-create-comment-on-contract.js.map