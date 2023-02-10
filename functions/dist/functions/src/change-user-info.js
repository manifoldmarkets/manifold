"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeUser = exports.changeuserinfo = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const clean_username_1 = require("../../common/util/clean-username");
const object_1 = require("../../common/util/object");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    username: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    avatarUrl: zod_1.z.string().optional(),
});
exports.changeuserinfo = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { username, name, avatarUrl } = (0, api_1.validate)(bodySchema, req.body);
    const user = await (0, utils_1.getUser)(auth.uid);
    if (!user)
        throw new api_1.APIError(400, 'User not found');
    const cleanedUsername = username ? (0, clean_username_1.cleanUsername)(username) : undefined;
    if (username) {
        if (!cleanedUsername)
            throw new api_1.APIError(400, 'Invalid username');
        const otherUserExists = await (0, utils_1.getUserByUsername)(cleanedUsername);
        if (otherUserExists)
            throw new api_1.APIError(400, 'Username already taken');
    }
    // TODO not sure about denying duplicate display names
    try {
        await (0, exports.changeUser)(user, {
            username: cleanedUsername,
            name,
            avatarUrl,
        });
        return { message: 'Successfully changed user info.' };
    }
    catch (e) {
        console.error(e);
        throw new api_1.APIError(500, 'update failed, please revert changes');
    }
});
const changeUser = async (user, update) => {
    var _a, _b, _c;
    if (update.username)
        update.username = (0, clean_username_1.cleanUsername)(update.username);
    if (update.name)
        update.name = (0, clean_username_1.cleanDisplayName)(update.name);
    // Update contracts, comments, and answers outside of a transaction to avoid contention.
    // Using bulkWriter to supports >500 writes at a time
    const contractSnap = await firestore
        .collection('contracts')
        .where('creatorId', '==', user.id)
        .select()
        .get();
    const contractUpdate = (0, object_1.removeUndefinedProps)({
        creatorName: update.name,
        creatorUsername: update.username,
        creatorAvatarUrl: update.avatarUrl,
    });
    const commentSnap = await firestore
        .collectionGroup('comments')
        .where('userId', '==', user.id)
        .select()
        .get();
    const commentUpdate = (0, object_1.removeUndefinedProps)({
        userName: update.name,
        userUsername: update.username,
        userAvatarUrl: update.avatarUrl,
    });
    const betsSnap = await firestore
        .collectionGroup('bets')
        .where('userId', '==', user.id)
        .select()
        .get();
    const betsUpdate = (0, object_1.removeUndefinedProps)({
        userName: update.name,
        userUsername: update.username,
        userAvatarUrl: update.avatarUrl,
    });
    const contractMetricsSnap = await firestore
        .collection(`users/${user.id}/contract-metrics`)
        .get();
    const contractMetricsUpdate = (0, object_1.removeUndefinedProps)({
        userName: update.name,
        userUsername: update.username,
        userAvatarUrl: update.avatarUrl,
    });
    const bulkWriter = firestore.bulkWriter();
    const userRef = firestore.collection('users').doc(user.id);
    bulkWriter.update(userRef, (0, object_1.removeUndefinedProps)(update));
    commentSnap.docs.forEach((d) => bulkWriter.update(d.ref, commentUpdate));
    contractSnap.docs.forEach((d) => bulkWriter.update(d.ref, contractUpdate));
    betsSnap.docs.forEach((d) => bulkWriter.update(d.ref, betsUpdate));
    contractMetricsSnap.docs.forEach((d) => bulkWriter.update(d.ref, contractMetricsUpdate));
    const answerSnap = await firestore
        .collectionGroup('answers')
        .where('userId', '==', user.id)
        .get();
    const answerUpdate = (0, object_1.removeUndefinedProps)(update);
    answerSnap.docs.forEach((d) => bulkWriter.update(d.ref, answerUpdate));
    const answerContractIds = (0, lodash_1.uniq)(answerSnap.docs.map((a) => a.get('contractId')));
    const docRefs = answerContractIds.map((c) => firestore.collection('contracts').doc(c));
    // firestore.getall() will fail with zero params, so add this check
    if (docRefs.length > 0) {
        const answerContracts = await firestore.getAll(...docRefs);
        for (const doc of answerContracts) {
            const contract = doc.data();
            for (const a of contract.answers) {
                if (a.userId === user.id) {
                    a.username = (_a = update.username) !== null && _a !== void 0 ? _a : a.username;
                    a.avatarUrl = (_b = update.avatarUrl) !== null && _b !== void 0 ? _b : a.avatarUrl;
                    a.name = (_c = update.name) !== null && _c !== void 0 ? _c : a.name;
                }
            }
            bulkWriter.update(doc.ref, { answers: contract.answers });
        }
    }
    await bulkWriter.flush();
    console.log('Done writing!');
};
exports.changeUser = changeUser;
const firestore = admin.firestore();
//# sourceMappingURL=change-user-info.js.map