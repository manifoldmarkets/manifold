import { Node } from '@tiptap/core';
export interface TweetOptions {
    tweetId: string;
}
export declare const TiptapTweetNode: {
    name: string;
    group: string;
    atom: boolean;
    addAttributes(): {
        tweetId: {
            default: null;
        };
    };
    parseHTML(): {
        tag: string;
    }[];
    renderHTML(props: {
        HTMLAttributes: Record<string, any>;
    }): (string | Record<string, any>)[];
};
declare const _default: Node<TweetOptions, any>;
export default _default;
