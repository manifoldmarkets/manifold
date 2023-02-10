"use strict";
// Adopted from https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/iframe.ts
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@tiptap/core");
const iframeClasses = 'w-full h-80';
exports.default = core_1.Node.create({
    name: 'iframe',
    group: 'block',
    atom: true,
    addOptions() {
        return {
            allowFullscreen: true,
            HTMLAttributes: {},
        };
    },
    addAttributes() {
        return {
            src: {
                default: null,
            },
            frameBorder: {
                default: 0,
            },
            allowFullScreen: {
                default: this.options.allowFullscreen,
                parseHTML: () => this.options.allowFullscreen,
            },
        };
    },
    parseHTML() {
        return [{ tag: 'iframe' }];
    },
    renderHTML({ HTMLAttributes }) {
        return [
            'iframe',
            (0, core_1.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes, {
                class: iframeClasses,
            }),
        ];
    },
    addCommands() {
        return {
            setIframe: (options) => ({ tr, dispatch }) => {
                const { selection } = tr;
                const node = this.type.create(options);
                if (dispatch) {
                    tr.replaceRangeWith(selection.from, selection.to, node);
                }
                return true;
            },
        };
    },
});
//# sourceMappingURL=tiptap-iframe.js.map