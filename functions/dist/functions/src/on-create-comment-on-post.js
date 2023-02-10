"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateCommentOnPost = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
exports.onCreateCommentOnPost = functions
    .runWith({ secrets: ['MAILGUN_KEY'] })
    .firestore.document('posts/{postId}/comments/{commentId}')
    .onCreate(async (snapshot, context) => {
    var _a, _b, _c;
    const { postId } = context.params;
    const post = await (0, utils_1.getPost)(postId);
    if (!post)
        throw new Error('Could not find post corresponding with comment');
    if (post) {
        console.log((_a = post === null || post === void 0 ? void 0 : post.commentCount) !== null && _a !== void 0 ? _a : 0);
        await ((_b = snapshot.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.update({
            commentCount: ((_c = post === null || post === void 0 ? void 0 : post.commentCount) !== null && _c !== void 0 ? _c : 0) + 1,
        }));
    }
});
//# sourceMappingURL=on-create-comment-on-post.js.map