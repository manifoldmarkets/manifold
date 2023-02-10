"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatememberrole = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const constants_1 = require("../../common/envs/constants");
const api_1 = require("./api");
const create_notification_1 = require("./create-notification");
const bodySchema = zod_1.z.object({
    groupId: zod_1.z.string(),
    memberId: zod_1.z.string(),
    role: zod_1.z.string(),
});
exports.updatememberrole = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { groupId, memberId, role } = (0, api_1.validate)(bodySchema, req.body);
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
        const requesterDoc = firestore.doc(`groups/${groupId}/groupMembers/${auth.uid}`);
        const affectedMemberDoc = firestore.doc(`groups/${groupId}/groupMembers/${memberId}`);
        const groupDoc = firestore.doc(`groups/${groupId}`);
        const requesterUserDoc = firestore.doc(`users/${auth.uid}`);
        const [requesterSnap, affectedMemberSnap, groupSnap, requesterUserSnap] = await transaction.getAll(requesterDoc, affectedMemberDoc, groupDoc, requesterUserDoc);
        if (!groupSnap.exists)
            throw new api_1.APIError(400, 'Group cannot be found');
        if (!requesterSnap.exists)
            throw new api_1.APIError(400, 'You cannot be found in group');
        if (!affectedMemberSnap.exists)
            throw new api_1.APIError(400, 'Member cannot be found in group');
        if (!requesterUserSnap.exists)
            throw new api_1.APIError(400, 'You cannot be found');
        const requester = requesterSnap.data();
        const requesterUser = requesterUserSnap.data();
        const affectedMember = affectedMemberSnap.data();
        const group = groupSnap.data();
        const firebaseUser = await admin.auth().getUser(auth.uid);
        if (requester.role !== 'admin' &&
            requester.userId !== group.creatorId &&
            !(0, constants_1.isManifoldId)(auth.uid) &&
            !(0, constants_1.isAdmin)(firebaseUser.email) &&
            auth.uid != affectedMember.userId)
            throw new api_1.APIError(400, 'User does not have permission to change roles');
        if (auth.uid == affectedMember.userId && role !== 'member')
            throw new api_1.APIError(400, 'User can only change their role to a lower role');
        if (role == 'member') {
            transaction.update(affectedMemberDoc, {
                role: admin.firestore.FieldValue.delete(),
            });
        }
        else {
            transaction.update(affectedMemberDoc, { role: role });
        }
        if (requesterUser && auth.uid != memberId) {
            await (0, create_notification_1.createGroupStatusChangeNotification)(requesterUser, affectedMember, group, role);
        }
        return affectedMember;
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=update-group-member-role.js.map