"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userIsBlocked = exports.userOptedOutOfBrowserNotifications = exports.getNotificationDestinationsForUser = exports.getNotificationPreference = exports.notificationReasonToSubscriptionType = exports.getDefaultNotificationPreferences = void 0;
const array_1 = require("./util/array");
const api_1 = require("./api");
const constants_1 = require("./envs/constants");
const getDefaultNotificationPreferences = (isDev) => {
    const constructPref = (browserIf, emailIf, mobileIf) => {
        const browser = browserIf ? 'browser' : undefined;
        const email = isDev ? undefined : emailIf ? 'email' : undefined;
        const mobile = mobileIf ? 'mobile' : undefined;
        return (0, array_1.filterDefined)([
            browser,
            email,
            mobile,
        ]);
    };
    const defaults = {
        // Watched Markets
        all_comments_on_watched_markets: constructPref(true, false, false),
        all_answers_on_watched_markets: constructPref(true, false, false),
        // Comments
        tips_on_your_comments: constructPref(true, true, false),
        comments_by_followed_users_on_watched_markets: constructPref(true, true, false),
        all_replies_to_my_comments_on_watched_markets: constructPref(true, true, true),
        all_replies_to_my_answers_on_watched_markets: constructPref(true, true, true),
        all_comments_on_contracts_with_shares_in_on_watched_markets: constructPref(true, false, false),
        // Answers
        answers_by_followed_users_on_watched_markets: constructPref(true, true, false),
        answers_by_market_creator_on_watched_markets: constructPref(true, true, false),
        all_answers_on_contracts_with_shares_in_on_watched_markets: constructPref(true, true, false),
        // On users' markets
        your_contract_closed: constructPref(true, true, false),
        all_comments_on_my_markets: constructPref(true, true, false),
        all_answers_on_my_markets: constructPref(true, true, false),
        subsidized_your_market: constructPref(true, true, false),
        // Market updates
        resolutions_on_watched_markets: constructPref(true, false, true),
        market_updates_on_watched_markets: constructPref(true, false, false),
        market_updates_on_watched_markets_with_shares_in: constructPref(true, false, false),
        resolutions_on_watched_markets_with_shares_in: constructPref(true, true, true),
        //Balance Changes
        loan_income: constructPref(true, false, false),
        betting_streaks: constructPref(true, false, false),
        referral_bonuses: constructPref(true, true, false),
        unique_bettors_on_your_contract: constructPref(true, true, false),
        tipped_comments_on_watched_markets: constructPref(true, true, false),
        tips_on_your_markets: constructPref(true, true, false),
        limit_order_fills: constructPref(true, false, false),
        // General
        group_role_changed: constructPref(true, false, false),
        tagged_user: constructPref(true, true, false),
        on_new_follow: constructPref(true, true, false),
        contract_from_followed_user: constructPref(true, true, false),
        trending_markets: constructPref(false, true, false),
        profit_loss_updates: constructPref(true, true, false),
        probability_updates_on_watched_markets: constructPref(true, false, true),
        thank_you_for_purchases: constructPref(false, false, false),
        onboarding_flow: constructPref(true, true, false),
        user_liked_your_content: constructPref(true, false, false),
        opt_out_all: [],
    };
    return defaults;
};
exports.getDefaultNotificationPreferences = getDefaultNotificationPreferences;
// Adding a new key:value here is optional, you can just use a key of notification_subscription_types
// You might want to add a key:value here if there will be multiple notification reasons that map to the same
// subscription type, i.e. 'comment_on_contract_you_follow' and 'comment_on_contract_with_users_answer' both map to
// 'all_comments_on_watched_markets' subscription type
// TODO: perhaps better would be to map notification_subscription_types to arrays of notification_reason_types
exports.notificationReasonToSubscriptionType = {
    you_referred_user: 'referral_bonuses',
    user_joined_to_bet_on_your_market: 'referral_bonuses',
    tip_received: 'tips_on_your_comments',
    bet_fill: 'limit_order_fills',
    user_joined_from_your_group_invite: 'referral_bonuses',
    challenge_accepted: 'limit_order_fills',
    betting_streak_incremented: 'betting_streaks',
    liked_and_tipped_your_contract: 'tips_on_your_markets',
    comment_on_your_contract: 'all_comments_on_my_markets',
    answer_on_your_contract: 'all_answers_on_my_markets',
    comment_on_contract_you_follow: 'all_comments_on_watched_markets',
    answer_on_contract_you_follow: 'all_answers_on_watched_markets',
    update_on_contract_you_follow: 'market_updates_on_watched_markets',
    resolution_on_contract_you_follow: 'resolutions_on_watched_markets',
    comment_on_contract_with_users_shares_in: 'all_comments_on_contracts_with_shares_in_on_watched_markets',
    answer_on_contract_with_users_shares_in: 'all_answers_on_contracts_with_shares_in_on_watched_markets',
    update_on_contract_with_users_shares_in: 'market_updates_on_watched_markets_with_shares_in',
    resolution_on_contract_with_users_shares_in: 'resolutions_on_watched_markets_with_shares_in',
    comment_on_contract_with_users_answer: 'all_comments_on_watched_markets',
    update_on_contract_with_users_answer: 'market_updates_on_watched_markets',
    resolution_on_contract_with_users_answer: 'resolutions_on_watched_markets',
    answer_on_contract_with_users_answer: 'all_answers_on_watched_markets',
    comment_on_contract_with_users_comment: 'all_comments_on_watched_markets',
    answer_on_contract_with_users_comment: 'all_answers_on_watched_markets',
    update_on_contract_with_users_comment: 'market_updates_on_watched_markets',
    resolution_on_contract_with_users_comment: 'resolutions_on_watched_markets',
    reply_to_users_answer: 'all_replies_to_my_answers_on_watched_markets',
    reply_to_users_comment: 'all_replies_to_my_comments_on_watched_markets',
};
function getNotificationPreference(reason) {
    var _a;
    return ((_a = exports.notificationReasonToSubscriptionType[reason]) !== null && _a !== void 0 ? _a : reason);
}
exports.getNotificationPreference = getNotificationPreference;
const getNotificationDestinationsForUser = (privateUser, 
// TODO: accept reasons array from most to least important and work backwards
reason) => {
    var _a;
    const notificationSettings = privateUser.notificationPreferences;
    const unsubscribeEndpoint = (0, api_1.getFunctionUrl)('unsubscribe');
    try {
        const notificationPreference = getNotificationPreference(reason);
        const destinations = (_a = notificationSettings[notificationPreference]) !== null && _a !== void 0 ? _a : [];
        const optOutOfAllSettings = notificationSettings.opt_out_all;
        // Your market closure notifications are high priority, opt-out doesn't affect their delivery
        const optedOutOfEmail = optOutOfAllSettings.includes('email') &&
            notificationPreference !== 'your_contract_closed';
        const optedOutOfBrowser = optOutOfAllSettings.includes('browser') &&
            notificationPreference !== 'your_contract_closed';
        const optedOutOfPush = !privateUser.pushToken || optOutOfAllSettings.includes('mobile');
        return {
            sendToEmail: destinations.includes('email') && !optedOutOfEmail,
            sendToBrowser: destinations.includes('browser') && !optedOutOfBrowser,
            sendToMobile: destinations.includes('mobile') && !optedOutOfPush,
            unsubscribeUrl: `${unsubscribeEndpoint}?id=${privateUser.id}&type=${notificationPreference}`,
            urlToManageThisNotification: `${constants_1.DOMAIN}/notifications?tab=settings&section=${notificationPreference}`,
            notificationPreference,
        };
    }
    catch (e) {
        // Fail safely
        console.log(`couldn't get notification destinations for type ${reason} for user ${privateUser.id}`);
        return {
            sendToEmail: false,
            sendToBrowser: false,
            sendToMobile: false,
            unsubscribeUrl: '',
            urlToManageThisNotification: '',
        };
    }
};
exports.getNotificationDestinationsForUser = getNotificationDestinationsForUser;
const userOptedOutOfBrowserNotifications = (privateUser) => {
    const { notificationPreferences } = privateUser;
    const optOutOfAllSettings = notificationPreferences.opt_out_all;
    return optOutOfAllSettings.includes('browser');
};
exports.userOptedOutOfBrowserNotifications = userOptedOutOfBrowserNotifications;
const userIsBlocked = (privateUserReceiver, userSenderId) => {
    return (privateUserReceiver.blockedUserIds.includes(userSenderId) ||
        privateUserReceiver.blockedByUserIds.includes(userSenderId));
};
exports.userIsBlocked = userIsBlocked;
//# sourceMappingURL=user-notification-preferences.js.map