import { Group } from '../../../common/group';
export declare const getGroupForMarket: (question: string) => Promise<Group | undefined>;
export declare const getCloseDate: (question: string) => Promise<number | undefined>;
export declare const getImagePrompt: (question: string) => Promise<string | undefined>;
