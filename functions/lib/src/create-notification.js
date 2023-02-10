"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroupStatusChangeNotification = exports.createMarketClosedNotification = exports.createContractResolvedNotifications = exports.createNewContractNotification = exports.createUniqueBettorBonusNotification = exports.createLikeNotification = exports.createBettingStreakBonusNotification = exports.createChallengeAcceptedNotification = exports.createLoanIncomeNotification = exports.createReferralNotification = exports.createBetFillNotification = exports.createTipNotification = exports.createCommentOrAnswerOrUpdatedContractNotification = exports.createFollowOrMarketSubsidizedNotification = void 0;
const admin = require("firebase-admin");
const notification_1 = require("../../common/notification");
const utils_1 = require("./utils");
const lodash_1 = require("lodash");
const object_1 = require("../../common/util/object");
const emails_1 = require("./emails");
const array_1 = require("../../common/util/array");
const user_notification_preferences_1 = require("../../common/user-notification-preferences");
const create_push_notification_1 = require("./create-push-notification");
const firestore = admin.firestore();
const createFollowOrMarketSubsidizedNotification = async (sourceId, sourceType, sourceUpdateType, sourceUser, idempotencyKey, sourceText, miscData) => {
    const { contract: sourceContract, recipients } = miscData !== null && miscData !== void 0 ? miscData : {};
    const shouldReceiveNotification = (userId, userToReasonTexts) => {
        return (sourceUser.id != userId &&
            !Object.keys(userToReasonTexts).includes(userId));
    };
    const sendNotificationsIfSettingsPermit = async (userToReasonTexts) => {
        for (const userId in userToReasonTexts) {
            const { reason } = userToReasonTexts[userId];
            const privateUser = await (0, utils_1.getPrivateUser)(userId);
            if (!privateUser)
                continue;
            const { sendToBrowser, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
            if (sendToBrowser) {
                const notificationRef = firestore
                    .collection(`/users/${userId}/notifications`)
                    .doc(idempotencyKey);
                const notification = {
                    id: idempotencyKey,
                    userId,
                    reason,
                    createdTime: Date.now(),
                    isSeen: false,
                    sourceId,
                    sourceType,
                    sourceUpdateType,
                    sourceContractId: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.id,
                    sourceUserName: sourceUser.name,
                    sourceUserUsername: sourceUser.username,
                    sourceUserAvatarUrl: sourceUser.avatarUrl,
                    sourceText,
                    sourceContractCreatorUsername: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.creatorUsername,
                    sourceContractTitle: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.question,
                    sourceContractSlug: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.slug,
                    sourceSlug: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.slug,
                    sourceTitle: sourceContract === null || sourceContract === void 0 ? void 0 : sourceContract.question,
                };
                await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
            }
            if (!sendToEmail)
                continue;
            if (reason === 'subsidized_your_market') {
                // TODO: send email to creator of market that was subsidized
            }
            else if (reason === 'on_new_follow') {
                // TODO: send email to user who was followed
            }
        }
    };
    // The following functions modify the userToReasonTexts object in place.
    const userToReasonTexts = {};
    if (sourceType === 'follow' && (recipients === null || recipients === void 0 ? void 0 : recipients[0])) {
        if (shouldReceiveNotification(recipients[0], userToReasonTexts))
            userToReasonTexts[recipients[0]] = {
                reason: 'on_new_follow',
            };
        return await sendNotificationsIfSettingsPermit(userToReasonTexts);
    }
    else if (sourceType === 'liquidity' && sourceContract) {
        if (shouldReceiveNotification(sourceContract.creatorId, userToReasonTexts))
            userToReasonTexts[sourceContract.creatorId] = {
                reason: 'subsidized_your_market',
            };
        return await sendNotificationsIfSettingsPermit(userToReasonTexts);
    }
};
exports.createFollowOrMarketSubsidizedNotification = createFollowOrMarketSubsidizedNotification;
const createCommentOrAnswerOrUpdatedContractNotification = async (sourceId, sourceType, sourceUpdateType, sourceUser, idempotencyKey, sourceText, sourceContract, miscData) => {
    const { repliedUsersInfo, taggedUserIds } = miscData !== null && miscData !== void 0 ? miscData : {};
    const usersToReceivedNotifications = {};
    const contractFollowersSnap = await firestore
        .collection(`contracts/${sourceContract.id}/follows`)
        .get();
    const contractFollowersIds = {};
    contractFollowersSnap.docs.map((doc) => (contractFollowersIds[doc.data().id] = true));
    const constructNotification = (userId, reason) => {
        const notification = {
            id: idempotencyKey,
            userId,
            reason,
            createdTime: Date.now(),
            isSeen: false,
            sourceId,
            sourceType,
            sourceUpdateType,
            sourceContractId: sourceContract.id,
            sourceUserName: sourceUser.name,
            sourceUserUsername: sourceUser.username,
            sourceUserAvatarUrl: sourceUser.avatarUrl,
            sourceText,
            sourceContractCreatorUsername: sourceContract.creatorUsername,
            sourceContractTitle: sourceContract.question,
            sourceContractSlug: sourceContract.slug,
            sourceSlug: sourceContract.slug,
            sourceTitle: sourceContract.question,
        };
        return (0, object_1.removeUndefinedProps)(notification);
    };
    const needNotFollowContractReasons = ['tagged_user'];
    const stillFollowingContract = (userId) => {
        // Should be better performance than includes
        return contractFollowersIds[userId] !== undefined;
    };
    const sendNotificationsIfSettingsPermit = async (userId, reason) => {
        var _a, _b, _c;
        // A user doesn't have to follow a market to receive a notification with their tag
        if ((!stillFollowingContract(userId) &&
            !needNotFollowContractReasons.includes(reason)) ||
            sourceUser.id == userId)
            return;
        const privateUser = await (0, utils_1.getPrivateUser)(userId);
        if (!privateUser)
            return;
        if ((0, user_notification_preferences_1.userIsBlocked)(privateUser, sourceUser.id))
            return;
        const { sendToBrowser, sendToEmail, sendToMobile, notificationPreference } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
        const receivedNotifications = (_a = usersToReceivedNotifications[userId]) !== null && _a !== void 0 ? _a : [];
        // Browser notifications
        if (sendToBrowser && !receivedNotifications.includes('browser')) {
            const notificationRef = firestore
                .collection(`/users/${userId}/notifications`)
                .doc(idempotencyKey);
            const notification = constructNotification(userId, reason);
            await notificationRef.set(notification);
            receivedNotifications.push('browser');
        }
        // Mobile push notifications
        if (sendToMobile && !receivedNotifications.includes('mobile')) {
            const reasonText = (_b = (notificationPreference &&
                notification_1.NOTIFICATION_DESCRIPTIONS[notificationPreference].verb)) !== null && _b !== void 0 ? _b : 'commented';
            const notification = constructNotification(userId, reason);
            await (0, create_push_notification_1.createPushNotification)(notification, privateUser, `${sourceUser.name} ${reasonText} on ${sourceContract.question}`, sourceText);
            receivedNotifications.push('mobile');
        }
        // Email notifications
        if (sendToEmail && !receivedNotifications.includes('email')) {
            if (sourceType === 'comment') {
                const { repliedToType, repliedToAnswerText, repliedToId, bet } = (_c = repliedUsersInfo === null || repliedUsersInfo === void 0 ? void 0 : repliedUsersInfo[userId]) !== null && _c !== void 0 ? _c : {};
                // TODO: change subject of email title to be more specific, i.e.: replied to you on/tagged you on/comment
                await (0, emails_1.sendNewCommentEmail)(reason, privateUser, sourceUser, sourceContract, sourceText, sourceId, bet, repliedToAnswerText, repliedToType === 'answer' ? repliedToId : undefined);
                receivedNotifications.push('email');
            }
            else if (sourceType === 'answer') {
                await (0, emails_1.sendNewAnswerEmail)(reason, privateUser, sourceUser.name, sourceText, sourceContract, sourceUser.avatarUrl);
                receivedNotifications.push('email');
            }
        }
        usersToReceivedNotifications[userId] = receivedNotifications;
    };
    const notifyContractFollowers = async () => {
        await Promise.all(Object.keys(contractFollowersIds).map((userId) => sendNotificationsIfSettingsPermit(userId, sourceType === 'answer'
            ? 'answer_on_contract_you_follow'
            : sourceType === 'comment'
                ? 'comment_on_contract_you_follow'
                : sourceUpdateType === 'updated'
                    ? 'update_on_contract_you_follow'
                    : 'resolution_on_contract_you_follow')));
    };
    const notifyContractCreator = async () => {
        await sendNotificationsIfSettingsPermit(sourceContract.creatorId, sourceType === 'comment'
            ? 'comment_on_your_contract'
            : 'answer_on_your_contract');
    };
    const notifyOtherAnswerersOnContract = async () => {
        const answers = await (0, utils_1.getValues)(firestore
            .collection('contracts')
            .doc(sourceContract.id)
            .collection('answers'));
        const recipientUserIds = (0, lodash_1.uniq)(answers.map((answer) => answer.userId));
        await Promise.all(recipientUserIds.map((userId) => sendNotificationsIfSettingsPermit(userId, sourceType === 'answer'
            ? 'answer_on_contract_with_users_answer'
            : sourceType === 'comment'
                ? 'comment_on_contract_with_users_answer'
                : sourceUpdateType === 'updated'
                    ? 'update_on_contract_with_users_answer'
                    : 'resolution_on_contract_with_users_answer')));
    };
    const notifyOtherCommentersOnContract = async () => {
        const comments = await (0, utils_1.getValues)(firestore
            .collection('contracts')
            .doc(sourceContract.id)
            .collection('comments'));
        const recipientUserIds = (0, lodash_1.uniq)(comments.map((comment) => comment.userId));
        await Promise.all(recipientUserIds.map((userId) => sendNotificationsIfSettingsPermit(userId, sourceType === 'answer'
            ? 'answer_on_contract_with_users_comment'
            : sourceType === 'comment'
                ? 'comment_on_contract_with_users_comment'
                : sourceUpdateType === 'updated'
                    ? 'update_on_contract_with_users_comment'
                    : 'resolution_on_contract_with_users_comment')));
    };
    const notifyBettorsOnContract = async () => {
        var _a;
        // We don't need to filter by shares in bc they auto unfollow a market upon selling out of it
        // Unhandled case sacrificed for performance: they bet in a market, sold out,
        // then re-followed it - their notification reason should not include 'with_shares_in'
        const recipientUserIds = (_a = sourceContract.uniqueBettorIds) !== null && _a !== void 0 ? _a : [];
        await Promise.all(recipientUserIds.map((userId) => sendNotificationsIfSettingsPermit(userId, sourceType === 'answer'
            ? 'answer_on_contract_with_users_shares_in'
            : sourceType === 'comment'
                ? 'comment_on_contract_with_users_shares_in'
                : sourceUpdateType === 'updated'
                    ? 'update_on_contract_with_users_shares_in'
                    : 'resolution_on_contract_with_users_shares_in')));
    };
    const notifyRepliedUser = async () => {
        if (sourceType === 'comment' && repliedUsersInfo)
            await Promise.all(Object.keys(repliedUsersInfo).map((userId) => sendNotificationsIfSettingsPermit(userId, repliedUsersInfo[userId].repliedToType === 'answer'
                ? 'reply_to_users_answer'
                : 'reply_to_users_comment')));
    };
    const notifyTaggedUsers = async () => {
        if (sourceType === 'comment' && taggedUserIds && taggedUserIds.length > 0)
            await Promise.all(taggedUserIds.map((userId) => sendNotificationsIfSettingsPermit(userId, 'tagged_user')));
    };
    const notifyLiquidityProviders = async () => {
        const liquidityProviders = await firestore
            .collection(`contracts/${sourceContract.id}/liquidity`)
            .get();
        const liquidityProvidersIds = (0, lodash_1.uniq)(liquidityProviders.docs.map((doc) => doc.data().userId));
        await Promise.all(liquidityProvidersIds.map((userId) => sendNotificationsIfSettingsPermit(userId, sourceType === 'answer'
            ? 'answer_on_contract_with_users_shares_in'
            : sourceType === 'comment'
                ? 'comment_on_contract_with_users_shares_in'
                : sourceUpdateType === 'updated'
                    ? 'update_on_contract_with_users_shares_in'
                    : 'resolution_on_contract_with_users_shares_in')));
    };
    //TODO: store all possible reasons why the user might be getting the notification
    // and choose the most lenient that they have enabled so they will unsubscribe
    // from the least important notifications
    (0, utils_1.log)('notifying replies');
    await notifyRepliedUser();
    (0, utils_1.log)('notifying tagged users');
    await notifyTaggedUsers();
    (0, utils_1.log)('notifying creator');
    await notifyContractCreator();
    (0, utils_1.log)('notifying answerers');
    await notifyOtherAnswerersOnContract();
    (0, utils_1.log)('notifying lps');
    await notifyLiquidityProviders();
    (0, utils_1.log)('notifying bettors');
    await notifyBettorsOnContract();
    (0, utils_1.log)('notifying commenters');
    await notifyOtherCommentersOnContract();
    // if they weren't notified previously, notify them now
    (0, utils_1.log)('notifying followers');
    await notifyContractFollowers();
};
exports.createCommentOrAnswerOrUpdatedContractNotification = createCommentOrAnswerOrUpdatedContractNotification;
const createTipNotification = async (fromUser, toUser, tip, idempotencyKey, commentId, contract, group) => {
    const privateUser = await (0, utils_1.getPrivateUser)(toUser.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'tip_received');
    if (!sendToBrowser)
        return;
    const slug = group ? group.slug + `#${commentId}` : commentId;
    const notificationRef = firestore
        .collection(`/users/${toUser.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: toUser.id,
        reason: 'tip_received',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: tip.id,
        sourceType: 'tip',
        sourceUpdateType: 'created',
        sourceUserName: fromUser.name,
        sourceUserUsername: fromUser.username,
        sourceUserAvatarUrl: fromUser.avatarUrl,
        sourceText: tip.amount.toString(),
        sourceContractCreatorUsername: contract === null || contract === void 0 ? void 0 : contract.creatorUsername,
        sourceContractTitle: contract === null || contract === void 0 ? void 0 : contract.question,
        sourceContractSlug: contract === null || contract === void 0 ? void 0 : contract.slug,
        sourceSlug: slug,
        sourceTitle: group === null || group === void 0 ? void 0 : group.name,
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    // TODO: send notification to users that are watching the contract and want highly tipped comments only
    // maybe TODO: send email notification to bet creator
};
exports.createTipNotification = createTipNotification;
const createBetFillNotification = async (fromUser, toUser, bet, limitBet, contract, idempotencyKey) => {
    var _a;
    const privateUser = await (0, utils_1.getPrivateUser)(toUser.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'bet_fill');
    if (!sendToBrowser)
        return;
    const fill = limitBet.fills.find((fill) => fill.matchedBetId === bet.id);
    const fillAmount = (_a = fill === null || fill === void 0 ? void 0 : fill.amount) !== null && _a !== void 0 ? _a : 0;
    const remainingAmount = limitBet.orderAmount - (0, lodash_1.sum)(limitBet.fills.map((f) => f.amount));
    const limitAt = contract.outcomeType === 'PSEUDO_NUMERIC'
        ? limitBet.limitProb * (contract.max - contract.min) + contract.min
        : Math.round(limitBet.limitProb * 100) + '%';
    const notificationRef = firestore
        .collection(`/users/${toUser.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: toUser.id,
        reason: 'bet_fill',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: limitBet.id,
        sourceType: 'bet',
        sourceUpdateType: 'updated',
        sourceUserName: fromUser.name,
        sourceUserUsername: fromUser.username,
        sourceUserAvatarUrl: fromUser.avatarUrl,
        sourceText: fillAmount.toString(),
        sourceContractCreatorUsername: contract.creatorUsername,
        sourceContractTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceContractId: contract.id,
        data: {
            betOutcome: bet.outcome,
            creatorOutcome: limitBet.outcome,
            fillAmount,
            probability: limitBet.limitProb,
            limitOrderTotal: limitBet.orderAmount,
            limitOrderRemaining: remainingAmount,
            limitAt: limitAt.toString(),
            outcomeType: contract.outcomeType,
        },
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    // maybe TODO: send email notification to bet creator
};
exports.createBetFillNotification = createBetFillNotification;
const createReferralNotification = async (toUser, referredUser, idempotencyKey, bonusAmount, referredByContract, referredByGroup) => {
    const privateUser = await (0, utils_1.getPrivateUser)(toUser.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'you_referred_user');
    if (!sendToBrowser)
        return;
    const notificationRef = firestore
        .collection(`/users/${toUser.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: toUser.id,
        reason: referredByGroup
            ? 'user_joined_from_your_group_invite'
            : (referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.creatorId) === toUser.id
                ? 'user_joined_to_bet_on_your_market'
                : 'you_referred_user',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: referredUser.id,
        sourceType: 'user',
        sourceUpdateType: 'updated',
        sourceContractId: referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.id,
        sourceUserName: referredUser.name,
        sourceUserUsername: referredUser.username,
        sourceUserAvatarUrl: referredUser.avatarUrl,
        sourceText: bonusAmount,
        // Only pass the contract referral details if they weren't referred to a group
        sourceContractCreatorUsername: !referredByGroup
            ? referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.creatorUsername
            : undefined,
        sourceContractTitle: !referredByGroup
            ? referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.question
            : undefined,
        sourceContractSlug: !referredByGroup ? referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.slug : undefined,
        sourceSlug: referredByGroup
            ? groupPath(referredByGroup.slug)
            : referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.slug,
        sourceTitle: referredByGroup
            ? referredByGroup.name
            : referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.question,
    };
    await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    // TODO send email notification
};
exports.createReferralNotification = createReferralNotification;
const createLoanIncomeNotification = async (toUser, idempotencyKey, income) => {
    const privateUser = await (0, utils_1.getPrivateUser)(toUser.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'loan_income');
    if (!sendToBrowser)
        return;
    const notificationRef = firestore
        .collection(`/users/${toUser.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: toUser.id,
        reason: 'loan_income',
        createdTime: Date.now(),
        isSeen: true,
        sourceId: idempotencyKey,
        sourceType: 'loan',
        sourceUpdateType: 'updated',
        sourceUserName: toUser.name,
        sourceUserUsername: toUser.username,
        sourceUserAvatarUrl: toUser.avatarUrl,
        sourceText: income.toString(),
        sourceTitle: 'Loan',
    };
    await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
};
exports.createLoanIncomeNotification = createLoanIncomeNotification;
const groupPath = (groupSlug) => `/group/${groupSlug}`;
const createChallengeAcceptedNotification = async (challenger, challengeCreator, challenge, acceptedAmount, contract) => {
    const privateUser = await (0, utils_1.getPrivateUser)(challengeCreator.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'challenge_accepted');
    if (!sendToBrowser)
        return;
    const notificationRef = firestore
        .collection(`/users/${challengeCreator.id}/notifications`)
        .doc();
    const notification = {
        id: notificationRef.id,
        userId: challengeCreator.id,
        reason: 'challenge_accepted',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: challenge.slug,
        sourceType: 'challenge',
        sourceUpdateType: 'updated',
        sourceUserName: challenger.name,
        sourceUserUsername: challenger.username,
        sourceUserAvatarUrl: challenger.avatarUrl,
        sourceText: acceptedAmount.toString(),
        sourceContractCreatorUsername: contract.creatorUsername,
        sourceContractTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceContractId: contract.id,
        sourceSlug: `/challenges/${challengeCreator.username}/${challenge.contractSlug}/${challenge.slug}`,
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
};
exports.createChallengeAcceptedNotification = createChallengeAcceptedNotification;
const createBettingStreakBonusNotification = async (user, txnId, bet, contract, amount, streak, idempotencyKey) => {
    const privateUser = await (0, utils_1.getPrivateUser)(user.id);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'betting_streak_incremented');
    if (!sendToBrowser)
        return;
    const notificationRef = firestore
        .collection(`/users/${user.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: user.id,
        reason: 'betting_streak_incremented',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: txnId,
        sourceType: 'betting_streak_bonus',
        sourceUpdateType: 'created',
        sourceUserName: user.name,
        sourceUserUsername: user.username,
        sourceUserAvatarUrl: user.avatarUrl,
        sourceText: amount.toString(),
        sourceSlug: `/${contract.creatorUsername}/${contract.slug}/bets/${bet.id}`,
        sourceTitle: 'Betting Streak Bonus',
        // Perhaps not necessary, but just in case
        sourceContractSlug: contract.slug,
        sourceContractId: contract.id,
        sourceContractTitle: contract.question,
        sourceContractCreatorUsername: contract.creatorUsername,
        data: {
            streak: streak,
            bonusAmount: amount,
        },
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
};
exports.createBettingStreakBonusNotification = createBettingStreakBonusNotification;
const createLikeNotification = async (reaction) => {
    const privateUser = await (0, utils_1.getPrivateUser)(reaction.contentOwnerId);
    if (!privateUser)
        return;
    const { sendToBrowser } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'user_liked_your_content');
    if (!sendToBrowser)
        return;
    // Reaction ids are constructed via contentId-reactionType, so this ensures idempotency
    const id = `${reaction.userId}-${reaction.id}`;
    const notificationRef = firestore
        .collection(`/users/${reaction.contentOwnerId}/notifications`)
        .doc(id);
    const notification = {
        id,
        userId: reaction.contentOwnerId,
        reason: 'user_liked_your_content',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: reaction.id,
        sourceType: reaction.contentType === 'contract' ? 'contract_like' : 'comment_like',
        sourceUpdateType: 'created',
        sourceUserName: reaction.userDisplayName,
        sourceUserUsername: reaction.userUsername,
        sourceUserAvatarUrl: reaction.userAvatarUrl,
        sourceContractId: reaction.contentType === 'contract'
            ? reaction.contentId
            : reaction.contentParentId,
        sourceText: reaction.text,
        sourceSlug: reaction.slug,
        sourceTitle: reaction.title,
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
};
exports.createLikeNotification = createLikeNotification;
const createUniqueBettorBonusNotification = async (contractCreatorId, bettor, txnId, contract, amount, uniqueBettorIds, idempotencyKey) => {
    const privateUser = await (0, utils_1.getPrivateUser)(contractCreatorId);
    if (!privateUser)
        return;
    const { sendToBrowser, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'unique_bettors_on_your_contract');
    if (sendToBrowser) {
        const notificationRef = firestore
            .collection(`/users/${contractCreatorId}/notifications`)
            .doc(idempotencyKey);
        const notification = {
            id: idempotencyKey,
            userId: contractCreatorId,
            reason: 'unique_bettors_on_your_contract',
            createdTime: Date.now(),
            isSeen: false,
            sourceId: txnId,
            sourceType: 'bonus',
            sourceUpdateType: 'created',
            sourceUserName: bettor.name,
            sourceUserUsername: bettor.username,
            sourceUserAvatarUrl: bettor.avatarUrl,
            sourceText: amount.toString(),
            sourceSlug: contract.slug,
            sourceTitle: contract.question,
            // Perhaps not necessary, but just in case
            sourceContractSlug: contract.slug,
            sourceContractId: contract.id,
            sourceContractTitle: contract.question,
            sourceContractCreatorUsername: contract.creatorUsername,
        };
        await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    }
    if (!sendToEmail)
        return;
    const uniqueBettorsExcludingCreator = uniqueBettorIds.filter((id) => id !== contractCreatorId);
    // only send on 1st and 6th bettor
    if (uniqueBettorsExcludingCreator.length !== 1 &&
        uniqueBettorsExcludingCreator.length !== 6)
        return;
    const totalNewBettorsToReport = uniqueBettorsExcludingCreator.length === 1 ? 1 : 5;
    const mostRecentUniqueBettors = await (0, utils_1.getValues)(firestore
        .collection('users')
        .where('id', 'in', uniqueBettorsExcludingCreator.slice(uniqueBettorsExcludingCreator.length - totalNewBettorsToReport, uniqueBettorsExcludingCreator.length)));
    const bets = await (0, utils_1.getValues)(firestore.collection('contracts').doc(contract.id).collection('bets'));
    // group bets by bettors
    const bettorsToTheirBets = (0, lodash_1.groupBy)(bets, (bet) => bet.userId);
    await (0, emails_1.sendNewUniqueBettorsEmail)('unique_bettors_on_your_contract', contractCreatorId, privateUser, contract, uniqueBettorsExcludingCreator.length, mostRecentUniqueBettors, bettorsToTheirBets, Math.round(amount * totalNewBettorsToReport));
};
exports.createUniqueBettorBonusNotification = createUniqueBettorBonusNotification;
const createNewContractNotification = async (contractCreator, contract, idempotencyKey, text, mentionedUserIds) => {
    const sendNotificationsIfSettingsAllow = async (userId, reason) => {
        const privateUser = await (0, utils_1.getPrivateUser)(userId);
        if (!privateUser)
            return;
        if ((0, user_notification_preferences_1.userIsBlocked)(privateUser, contractCreator.id))
            return;
        const { sendToBrowser, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
        if (sendToBrowser) {
            const notificationRef = firestore
                .collection(`/users/${userId}/notifications`)
                .doc(idempotencyKey);
            const notification = {
                id: idempotencyKey,
                userId: userId,
                reason,
                createdTime: Date.now(),
                isSeen: false,
                sourceId: contract.id,
                sourceType: 'contract',
                sourceUpdateType: 'created',
                sourceUserName: contractCreator.name,
                sourceUserUsername: contractCreator.username,
                sourceUserAvatarUrl: contractCreator.avatarUrl,
                sourceText: text,
                sourceSlug: contract.slug,
                sourceTitle: contract.question,
                sourceContractSlug: contract.slug,
                sourceContractId: contract.id,
                sourceContractTitle: contract.question,
                sourceContractCreatorUsername: contract.creatorUsername,
            };
            await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
        }
        if (!sendToEmail)
            return;
        if (reason === 'contract_from_followed_user')
            await (0, emails_1.sendNewFollowedMarketEmail)(reason, userId, privateUser, contract);
    };
    const followersSnapshot = await firestore
        .collectionGroup('follows')
        .where('userId', '==', contractCreator.id)
        .get();
    const followerUserIds = (0, array_1.filterDefined)(followersSnapshot.docs.map((doc) => {
        var _a;
        const followerUserId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        return followerUserId && followerUserId != contractCreator.id
            ? followerUserId
            : undefined;
    }));
    // As it is coded now, the tag notification usurps the new contract notification
    // It'd be easy to append the reason to the eventId if desired
    if (contract.visibility === 'public') {
        for (const followerUserId of followerUserIds) {
            await sendNotificationsIfSettingsAllow(followerUserId, 'contract_from_followed_user');
        }
    }
    for (const mentionedUserId of mentionedUserIds) {
        await sendNotificationsIfSettingsAllow(mentionedUserId, 'tagged_user');
    }
};
exports.createNewContractNotification = createNewContractNotification;
const createContractResolvedNotifications = async (contract, creator, outcome, probabilityInt, resolutionValue, resolutionData) => {
    var _a;
    let resolutionText = outcome !== null && outcome !== void 0 ? outcome : contract.question;
    if (contract.outcomeType === 'FREE_RESPONSE' ||
        contract.outcomeType === 'MULTIPLE_CHOICE') {
        const answerText = (_a = contract.answers.find((answer) => answer.id === outcome)) === null || _a === void 0 ? void 0 : _a.text;
        if (answerText)
            resolutionText = answerText;
    }
    else if (contract.outcomeType === 'BINARY') {
        if (resolutionText === 'MKT' && probabilityInt)
            resolutionText = `${probabilityInt}%`;
        else if (resolutionText === 'MKT')
            resolutionText = 'PROB';
    }
    else if (contract.outcomeType === 'PSEUDO_NUMERIC') {
        if (resolutionText === 'MKT' && resolutionValue)
            resolutionText = `${resolutionValue}`;
    }
    const constructNotification = (userId, reason) => {
        var _a, _b;
        return {
            id: idempotencyKey,
            userId,
            reason,
            createdTime: Date.now(),
            isSeen: false,
            sourceId: contract.id,
            sourceType: 'contract',
            sourceUpdateType: 'resolved',
            sourceContractId: contract.id,
            sourceUserName: creator.name,
            sourceUserUsername: creator.username,
            sourceUserAvatarUrl: creator.avatarUrl,
            sourceText: resolutionText,
            sourceContractCreatorUsername: contract.creatorUsername,
            sourceContractTitle: contract.question,
            sourceContractSlug: contract.slug,
            sourceSlug: contract.slug,
            sourceTitle: contract.question,
            data: {
                outcome,
                userInvestment: (_a = resolutionData.userInvestments[userId]) !== null && _a !== void 0 ? _a : 0,
                userPayout: (_b = resolutionData.userPayouts[userId]) !== null && _b !== void 0 ? _b : 0,
            },
        };
    };
    const idempotencyKey = contract.id + '-resolved';
    const createBrowserNotification = async (userId, reason) => {
        const notificationRef = firestore
            .collection(`/users/${userId}/notifications`)
            .doc(idempotencyKey);
        const notification = constructNotification(userId, reason);
        return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    };
    const sendNotificationsIfSettingsPermit = async (userId, reason) => {
        var _a, _b;
        const privateUser = await (0, utils_1.getPrivateUser)(userId);
        if (!privateUser)
            return;
        const { sendToBrowser, sendToEmail, sendToMobile } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
        // Browser notifications
        if (sendToBrowser) {
            await createBrowserNotification(userId, reason);
        }
        // Emails notifications
        if (sendToEmail && !contract.isTwitchContract)
            await (0, emails_1.sendMarketResolutionEmail)(reason, privateUser, (_a = resolutionData.userInvestments[userId]) !== null && _a !== void 0 ? _a : 0, (_b = resolutionData.userPayouts[userId]) !== null && _b !== void 0 ? _b : 0, creator, resolutionData.creatorPayout, contract, resolutionData.outcome, resolutionData.resolutionProbability, resolutionData.resolutions);
        if (sendToMobile) {
            const notification = constructNotification(userId, reason);
            await (0, create_push_notification_1.createPushNotification)(notification, privateUser, contract.question.length > 50
                ? contract.question.slice(0, 50) + '...'
                : contract.question, `Resolved: ${resolutionText}`);
        }
    };
    const contractFollowersIds = (await (0, utils_1.getValues)(firestore.collection(`contracts/${contract.id}/follows`))).map((follow) => follow.id);
    // We ignore whether users are still watching a market if they have a payout, mainly
    // bc market resolutions changes their profits, and they'll likely want to know, esp. if NA resolution
    const usersToNotify = (0, lodash_1.uniq)([
        ...contractFollowersIds,
        ...Object.keys(resolutionData.userPayouts),
    ].filter((id) => id !== creator.id));
    await Promise.all(usersToNotify.map((id) => sendNotificationsIfSettingsPermit(id, resolutionData.userInvestments[id]
        ? 'resolution_on_contract_with_users_shares_in'
        : 'resolution_on_contract_you_follow')));
};
exports.createContractResolvedNotifications = createContractResolvedNotifications;
const createMarketClosedNotification = async (contract, creator, privateUser, idempotencyKey) => {
    var _a, _b;
    const notificationRef = firestore
        .collection(`/users/${creator.id}/notifications`)
        .doc(idempotencyKey);
    const notification = {
        id: idempotencyKey,
        userId: creator.id,
        reason: 'your_contract_closed',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: contract.id,
        sourceType: 'contract',
        sourceUpdateType: 'closed',
        sourceContractId: contract === null || contract === void 0 ? void 0 : contract.id,
        sourceUserName: creator.name,
        sourceUserUsername: creator.username,
        sourceUserAvatarUrl: creator.avatarUrl,
        sourceText: (_b = (_a = contract.closeTime) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : new Date().toString(),
        sourceContractCreatorUsername: creator.username,
        sourceContractTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceSlug: contract.slug,
        sourceTitle: contract.question,
    };
    await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
    await (0, emails_1.sendMarketCloseEmail)('your_contract_closed', creator, privateUser, contract);
};
exports.createMarketClosedNotification = createMarketClosedNotification;
const createGroupStatusChangeNotification = async (initiator, affectedMember, group, newStatus) => {
    var _a, _b;
    const privateUser = await (0, utils_1.getPrivateUser)(affectedMember.userId);
    if (!privateUser)
        return;
    let sourceText = `changed your role to ${newStatus}`;
    if (((!affectedMember.role || affectedMember.role == 'member') &&
        (newStatus == 'admin' || newStatus == 'moderator')) ||
        (affectedMember.role == 'moderator' && newStatus == 'admin')) {
        sourceText = `promoted you from ${(_a = affectedMember.role) !== null && _a !== void 0 ? _a : 'member'} to ${newStatus}`;
    }
    else if (((affectedMember.role == 'admin' || affectedMember.role == 'moderator') &&
        newStatus == 'member') ||
        (affectedMember.role == 'admin' && newStatus == 'moderator')) {
        sourceText = `demoted you from ${(_b = affectedMember.role) !== null && _b !== void 0 ? _b : 'member'} to ${newStatus}`;
    }
    const notificationRef = firestore
        .collection(`/users/${affectedMember.userId}/notifications`)
        .doc();
    const notification = {
        id: notificationRef.id,
        userId: affectedMember.userId,
        reason: 'group_role_changed',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: group.id,
        sourceType: 'group',
        sourceUpdateType: 'updated',
        sourceUserName: initiator.name,
        sourceUserUsername: initiator.username,
        sourceUserAvatarUrl: initiator.avatarUrl,
        sourceText: sourceText,
        sourceSlug: group.slug,
        sourceTitle: group.name,
        sourceContractId: 'group' + group.id,
    };
    return await notificationRef.set((0, object_1.removeUndefinedProps)(notification));
};
exports.createGroupStatusChangeNotification = createGroupStatusChangeNotification;
//# sourceMappingURL=create-notification.js.map