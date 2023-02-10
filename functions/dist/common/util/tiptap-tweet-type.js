"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiptapTweetNode = void 0;
const core_1 = require("@tiptap/core");
// This is a version of the Tiptap Node config without addNodeView,
// since that would require bundling in tsx
exports.TiptapTweetNode = {
    name: 'tiptapTweet',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            tweetId: {
                default: null,
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: 'tiptap-tweet',
            },
        ];
    },
    renderHTML(props) {
        return ['tiptap-tweet', (0, core_1.mergeAttributes)(props.HTMLAttributes)];
    },
};
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
exports.default = core_1.Node.create(exports.TiptapTweetNode);
//# sourceMappingURL=tiptap-tweet-type.js.map