"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostFromSlug = exports.getSlug = exports.createpost = void 0;
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const slugify_1 = require("../../common/util/slugify");
const random_1 = require("../../common/util/random");
const post_1 = require("../../common/post");
const api_1 = require("./api");
const zod_1 = require("zod");
const object_1 = require("../../common/util/object");
const create_market_1 = require("./create-market");
const time_1 = require("../../common/util/time");
const contentSchema = zod_1.z.lazy(() => zod_1.z.intersection(zod_1.z.record(zod_1.z.any()), zod_1.z.object({
    type: zod_1.z.string().optional(),
    attrs: zod_1.z.record(zod_1.z.any()).optional(),
    content: zod_1.z.array(contentSchema).optional(),
    marks: zod_1.z
        .array(zod_1.z.intersection(zod_1.z.record(zod_1.z.any()), zod_1.z.object({
        type: zod_1.z.string(),
        attrs: zod_1.z.record(zod_1.z.any()).optional(),
    })))
        .optional(),
    text: zod_1.z.string().optional(),
})));
const postSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(post_1.MAX_POST_TITLE_LENGTH),
    subtitle: zod_1.z.string().min(1).max(post_1.MAX_POST_SUBTITLE_LENGTH),
    content: contentSchema,
    isGroupAboutPost: zod_1.z.boolean().optional(),
    groupId: zod_1.z.string().optional(),
    // Date doc fields:
    bounty: zod_1.z.number().optional(),
    birthday: zod_1.z.number().optional(),
    type: zod_1.z.string().optional(),
    question: zod_1.z.string().optional(),
});
exports.createpost = (0, api_1.newEndpoint)({}, async (req, auth) => {
    var _a;
    const firestore = admin.firestore();
    const _b = (0, api_1.validate)(postSchema, req.body), { title, subtitle, content, isGroupAboutPost, groupId, question } = _b, otherProps = __rest(_b, ["title", "subtitle", "content", "isGroupAboutPost", "groupId", "question"]);
    const creator = await (0, utils_1.getUser)(auth.uid);
    if (!creator)
        throw new api_1.APIError(400, 'No user exists with the authenticated user ID.');
    console.log('creating post owned by', creator.username, 'titled', title);
    const slug = await (0, exports.getSlug)(title);
    const postRef = firestore.collection('posts').doc();
    // If this is a date doc, create a market for it.
    let contractSlug;
    if (question) {
        const closeTime = Date.now() + time_1.DAY_MS * 30 * 3;
        try {
            const result = await (0, create_market_1.createMarketHelper)({
                question,
                closeTime,
                outcomeType: 'BINARY',
                visibility: 'unlisted',
                initialProb: 50,
                // Dating group!
                groupId: 'j3ZE8fkeqiKmRGumy3O1',
            }, auth);
            contractSlug = result.slug;
        }
        catch (e) {
            console.error(e);
        }
    }
    const post = (0, object_1.removeUndefinedProps)(Object.assign(Object.assign({}, otherProps), { id: postRef.id, creatorId: creator.id, slug,
        title,
        subtitle,
        isGroupAboutPost, createdTime: Date.now(), content: content, contractSlug, creatorName: creator.name, creatorUsername: creator.username, creatorAvatarUrl: creator.avatarUrl, itemType: 'post' }));
    await postRef.create(post);
    if (groupId) {
        const groupRef = firestore.collection('groups').doc(groupId);
        const group = await groupRef.get();
        if (group.exists) {
            const groupData = group.data();
            if (groupData) {
                const postIds = (_a = groupData.postIds) !== null && _a !== void 0 ? _a : [];
                postIds.push(postRef.id);
                await groupRef.update({ postIds });
            }
        }
    }
    return { status: 'success', post };
});
const getSlug = async (title) => {
    const proposedSlug = (0, slugify_1.slugify)(title);
    const preexistingPost = await getPostFromSlug(proposedSlug);
    return preexistingPost ? proposedSlug + '-' + (0, random_1.randomString)() : proposedSlug;
};
exports.getSlug = getSlug;
async function getPostFromSlug(slug) {
    const firestore = admin.firestore();
    const snap = await firestore
        .collection('posts')
        .where('slug', '==', slug)
        .get();
    return snap.empty ? undefined : snap.docs[0].data();
}
exports.getPostFromSlug = getPostFromSlug;
//# sourceMappingURL=create-post.js.map