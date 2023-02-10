"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.richTextToString = exports.extensions = exports.parseMentions = exports.searchInAny = exports.wordIn = exports.beginsWith = exports.getUrl = void 0;
const core_1 = require("@tiptap/core");
const prosemirror_model_1 = require("prosemirror-model");
const starter_kit_1 = require("@tiptap/starter-kit");
const extension_image_1 = require("@tiptap/extension-image");
const extension_link_1 = require("@tiptap/extension-link");
const extension_mention_1 = require("@tiptap/extension-mention");
const tiptap_iframe_1 = require("./tiptap-iframe");
const tiptap_tweet_1 = require("./tiptap-tweet");
const linkifyjs_1 = require("linkifyjs");
const lodash_1 = require("lodash");
const tiptap_spoiler_1 = require("./tiptap-spoiler");
/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
function getUrl(text) {
    const results = (0, linkifyjs_1.find)(text, 'url');
    return results.length ? results[0].href : null;
}
exports.getUrl = getUrl;
const beginsWith = (text, query) => text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase());
exports.beginsWith = beginsWith;
// TODO: fuzzy matching
const wordIn = (word, corpus) => corpus.toLocaleLowerCase().includes(word.toLocaleLowerCase());
exports.wordIn = wordIn;
const checkAgainstQuery = (query, corpus) => query.split(' ').every((word) => (0, exports.wordIn)(word, corpus));
const searchInAny = (query, ...fields) => fields.some((field) => checkAgainstQuery(query, field));
exports.searchInAny = searchInAny;
/** @return user ids of all \@mentions */
function parseMentions(data) {
    var _a, _b;
    const mentions = (_b = (_a = data.content) === null || _a === void 0 ? void 0 : _a.flatMap(parseMentions)) !== null && _b !== void 0 ? _b : []; //dfs
    if (data.type === 'mention' && data.attrs) {
        mentions.push(data.attrs.id);
    }
    return (0, lodash_1.uniq)(mentions);
}
exports.parseMentions = parseMentions;
// TODO: this is a hack to get around the fact that tiptap doesn't have a
// way to add a node view without bundling in tsx
function skippableComponent(extension, label) {
    return core_1.Node.create({
        name: extension,
        group: 'block',
        renderText: () => label,
    });
}
exports.extensions = [
    starter_kit_1.StarterKit,
    extension_link_1.Link,
    extension_image_1.Image.extend({ renderText: () => '[image]' }),
    extension_mention_1.Mention,
    extension_mention_1.Mention.extend({ name: 'contract-mention' }),
    tiptap_iframe_1.default.extend({
        renderText: ({ node }) => '[embed]' + node.attrs.src ? `(${node.attrs.src})` : '',
    }),
    skippableComponent('gridCardsComponent', '[markets]'),
    skippableComponent('staticReactEmbedComponent', '[map]'),
    tiptap_tweet_1.TiptapTweet.extend({ renderText: () => '[tweet]' }),
    tiptap_spoiler_1.TiptapSpoiler.extend({ renderHTML: () => ['span', '[spoiler]', 0] }),
];
const extensionSchema = (0, core_1.getSchema)(exports.extensions);
const extensionSerializers = (0, core_1.getTextSerializersFromSchema)(extensionSchema);
function richTextToString(text) {
    if (!text)
        return '';
    try {
        const node = prosemirror_model_1.Node.fromJSON(extensionSchema, text);
        return (0, core_1.getText)(node, {
            blockSeparator: '\n\n',
            textSerializers: extensionSerializers,
        });
    }
    catch (e) {
        console.error('error parsing rich text', `"${text}":`, e);
        return '';
    }
}
exports.richTextToString = richTextToString;
//# sourceMappingURL=parse.js.map