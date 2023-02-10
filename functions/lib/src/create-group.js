"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGroupFromSlug = exports.getSlug = exports.creategroup = void 0;
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const slugify_1 = require("../../common/util/slugify");
const random_1 = require("../../common/util/random");
const group_1 = require("../../common/group");
const api_1 = require("./api");
const zod_1 = require("zod");
const bodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(group_1.MAX_GROUP_NAME_LENGTH),
    memberIds: zod_1.z.array(zod_1.z.string().min(1).max(group_1.MAX_ID_LENGTH)),
    anyoneCanJoin: zod_1.z.boolean(),
    about: zod_1.z.string().min(1).max(group_1.MAX_ABOUT_LENGTH).optional(),
});
exports.creategroup = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const firestore = admin.firestore();
    const { name, about, memberIds, anyoneCanJoin } = (0, api_1.validate)(bodySchema, req.body);
    const creator = await (0, utils_1.getUser)(auth.uid);
    if (!creator)
        throw new api_1.APIError(400, 'No user exists with the authenticated user ID.');
    // Add creator id to member ids for convenience
    if (!memberIds.includes(creator.id))
        memberIds.push(creator.id);
    console.log('creating group for', creator.username, 'named', name, 'about', about, 'other member ids', memberIds);
    const slug = await (0, exports.getSlug)(name);
    const groupRef = firestore.collection('groups').doc();
    const group = {
        id: groupRef.id,
        creatorId: creator.id,
        slug,
        name,
        about: about !== null && about !== void 0 ? about : '',
        createdTime: Date.now(),
        mostRecentActivityTime: Date.now(),
        // TODO: allow users to add contract ids on group creation
        anyoneCanJoin,
        totalContracts: 0,
        totalMembers: memberIds.length,
        postIds: [],
        pinnedItems: [],
    };
    await groupRef.create(group);
    // create a GroupMemberDoc for each member
    await Promise.all(memberIds.map((memberId) => {
        if (memberId === creator.id) {
            groupRef.collection('groupMembers').doc(memberId).create({
                userId: memberId,
                createdTime: Date.now(),
                role: 'admin',
            });
        }
        else {
            groupRef.collection('groupMembers').doc(memberId).create({
                userId: memberId,
                createdTime: Date.now(),
            });
        }
    }));
    return { status: 'success', group: group };
});
const getSlug = async (name) => {
    const proposedSlug = (0, slugify_1.slugify)(name);
    const preexistingGroup = await getGroupFromSlug(proposedSlug);
    return preexistingGroup ? proposedSlug + '-' + (0, random_1.randomString)() : proposedSlug;
};
exports.getSlug = getSlug;
async function getGroupFromSlug(slug) {
    const firestore = admin.firestore();
    const snap = await firestore
        .collection('groups')
        .where('slug', '==', slug)
        .get();
    return snap.empty ? undefined : snap.docs[0].data();
}
exports.getGroupFromSlug = getGroupFromSlug;
//# sourceMappingURL=create-group.js.map