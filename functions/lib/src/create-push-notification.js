"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPushNotification = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const user_notification_preferences_1 = require("../../common/user-notification-preferences");
const utils_1 = require("./utils");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const firestore = admin.firestore();
const createPushNotification = async (notification, privateUser, title, body) => {
    const expo = new expo_server_sdk_1.Expo();
    const { sendToMobile } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, notification.reason);
    if (!sendToMobile)
        return;
    const somePushTokens = [privateUser.pushToken];
    // Create the messages that you want to send to clients
    const messages = [];
    for (const pushToken of somePushTokens) {
        // Check that all your push tokens appear to be valid Expo push tokens
        if (!expo_server_sdk_1.Expo.isExpoPushToken(pushToken)) {
            (0, utils_1.log)(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }
        // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
        messages.push({
            to: pushToken,
            channelId: 'default',
            sound: 'default',
            title,
            body,
            data: notification,
        });
    }
    const tickets = await expo.sendPushNotificationsAsync(messages);
    // write successful tickets to db
    const [successTickets, errorTickets] = (0, lodash_1.partition)(tickets, (ticket) => ticket.status === 'ok');
    await Promise.all(successTickets.map(async (ticket) => firestore
        .collection(`users/${privateUser.id}/pushNotificationTickets`)
        .doc(ticket.id)
        .set(Object.assign(Object.assign({}, ticket), { userId: privateUser.id, notificationId: notification.id, createdTime: Date.now(), receiptStatus: 'not-checked' }))));
    await Promise.all(errorTickets.map(async (ticket) => {
        var _a;
        if (ticket.status === 'error') {
            (0, utils_1.log)('Error generating push notification, ticket:', ticket);
            if (((_a = ticket.details) === null || _a === void 0 ? void 0 : _a.error) === 'DeviceNotRegistered') {
                // set private user pushToken to null
                await firestore
                    .collection('private-users')
                    .doc(privateUser.id)
                    .update({
                    pushToken: admin.firestore.FieldValue.delete(),
                });
            }
        }
    }));
};
exports.createPushNotification = createPushNotification;
//# sourceMappingURL=create-push-notification.js.map