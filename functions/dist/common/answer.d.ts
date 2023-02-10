import { User } from './user';
export type Answer = {
    id: string;
    number: number;
    contractId: string;
    createdTime: number;
    userId: string;
    username: string;
    name: string;
    avatarUrl?: string;
    text: string;
};
export declare const getNoneAnswer: (contractId: string, creator: User) => {
    id: string;
    number: number;
    contractId: string;
    createdTime: number;
    userId: string;
    username: string;
    name: string;
    avatarUrl: string;
    text: string;
};
export declare const MAX_ANSWER_LENGTH = 240;
