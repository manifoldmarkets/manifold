import { Node, JSONContent } from '@tiptap/core';
/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
export declare function getUrl(text: string): string | null;
export declare const beginsWith: (text: string, query: string) => boolean;
export declare const wordIn: (word: string, corpus: string) => boolean;
export declare const searchInAny: (query: string, ...fields: string[]) => boolean;
/** @return user ids of all \@mentions */
export declare function parseMentions(data: JSONContent): string[];
export declare const extensions: (Node<any, any> | import("@tiptap/core").Extension<import("@tiptap/starter-kit").StarterKitOptions, any> | import("@tiptap/core").Mark<import("@tiptap/extension-link").LinkOptions, any> | import("@tiptap/core").Mark<import("./tiptap-spoiler").SpoilerOptions, any>)[];
export declare function richTextToString(text?: JSONContent): string;
