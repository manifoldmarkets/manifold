"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createcomment = void 0;
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const api_1 = require("./api");
const zod_1 = require("zod");
const object_1 = require("../../common/util/object");
const marked_1 = require("marked");
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
    contractId: zod_1.z.string(),
    content: contentSchema.optional(),
    html: zod_1.z.string().optional(),
    markdown: zod_1.z.string().optional(),
});
const MAX_COMMENT_JSON_LENGTH = 20000;
// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
exports.createcomment = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const firestore = admin.firestore();
    const { contractId, content, html, markdown } = (0, api_1.validate)(postSchema, req.body);
    const creator = await (0, utils_1.getUser)(auth.uid);
    const contract = await (0, utils_1.getContract)(contractId);
    if (!creator) {
        throw new api_1.APIError(400, 'No user exists with the authenticated user ID.');
    }
    if (!contract) {
        throw new api_1.APIError(400, 'No contract exists with the given ID.');
    }
    let contentJson = null;
    if (content) {
        contentJson = content;
    }
    else if (html) {
        contentJson = (0, utils_1.htmlToRichText)(html);
    }
    else if (markdown) {
        const markedParse = marked_1.marked.parse(markdown);
        contentJson = (0, utils_1.htmlToRichText)(markedParse);
    }
    if (!contentJson) {
        throw new api_1.APIError(400, 'No comment content provided.');
    }
    if (JSON.stringify(contentJson).length > MAX_COMMENT_JSON_LENGTH) {
        throw new api_1.APIError(400, `Comment is too long; should be less than ${MAX_COMMENT_JSON_LENGTH} as a JSON string.`);
    }
    const ref = firestore.collection(`contracts/${contractId}/comments`).doc();
    const comment = (0, object_1.removeUndefinedProps)({
        id: ref.id,
        content: contentJson,
        createdTime: Date.now(),
        userId: creator.id,
        userName: creator.name,
        userUsername: creator.username,
        userAvatarUrl: creator.avatarUrl,
        // OnContract fields
        commentType: 'contract',
        contractId: contractId,
        contractSlug: contract.slug,
        contractQuestion: contract.question,
    });
    await ref.set(comment);
    return { status: 'success', comment };
});
//# sourceMappingURL=create-comment.js.map