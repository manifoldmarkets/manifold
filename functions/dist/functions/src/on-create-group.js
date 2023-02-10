"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateGroup = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
exports.onCreateGroup = functions.firestore
    .document('groups/{groupId}')
    .onCreate(async (change, context) => {
    const group = change.data();
    const { eventId } = context;
    const groupCreator = await (0, utils_1.getUser)(group.creatorId);
    if (!groupCreator)
        throw new Error('Could not find group creator');
    // create notifications for all members of the group
    for (const memberId of group.memberIds) {
        await (0, create_notification_1.createNotification)(group.id, 'group', 'created', groupCreator, eventId, group.about, {
            relatedUserId: memberId,
            slug: group.slug,
            title: group.name,
        });
    }
});
//# sourceMappingURL=on-create-group.js.map