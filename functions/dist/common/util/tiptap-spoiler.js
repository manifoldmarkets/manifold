"use strict";
// adapted from @n8body/tiptap-spoiler
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiptapSpoiler = void 0;
const core_1 = require("@tiptap/core");
const spoilerInputRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))$/;
const spoilerPasteRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))/g;
exports.TiptapSpoiler = core_1.Mark.create({
    name: 'spoiler',
    inline: true,
    group: 'inline',
    inclusive: false,
    exitable: true,
    content: 'inline*',
    priority: 1001,
    addOptions() {
        return {
            class: '',
            inputRegex: spoilerInputRegex,
            pasteRegex: spoilerPasteRegex,
        };
    },
    addCommands() {
        return {
            setSpoiler: () => ({ commands }) => commands.setMark(this.name),
            toggleSpoiler: () => ({ commands }) => commands.toggleMark(this.name),
            unsetSpoiler: () => ({ commands }) => commands.unsetMark(this.name),
        };
    },
    addInputRules() {
        return [
            (0, core_1.markInputRule)({
                find: this.options.inputRegex,
                type: this.type,
            }),
        ];
    },
    addPasteRules() {
        return [
            (0, core_1.markPasteRule)({
                find: this.options.pasteRegex,
                type: this.type,
            }),
        ];
    },
    parseHTML() {
        return [{ tag: 'spoiler' }];
    },
    renderHTML({ HTMLAttributes }) {
        return [
            'spoiler',
            (0, core_1.mergeAttributes)(HTMLAttributes, { class: this.options.class }),
            0,
        ];
    },
});
//# sourceMappingURL=tiptap-spoiler.js.map