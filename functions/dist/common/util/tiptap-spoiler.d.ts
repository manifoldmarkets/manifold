import { Mark } from '@tiptap/core';
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        spoilerEditor: {
            setSpoiler: () => ReturnType;
            toggleSpoiler: () => ReturnType;
            unsetSpoiler: () => ReturnType;
        };
    }
}
export type SpoilerOptions = {
    class: string;
    inputRegex: RegExp;
    pasteRegex: RegExp;
};
export declare const TiptapSpoiler: Mark<SpoilerOptions, any>;
