import { Contract, outcomeType, visibility } from './contract';
import { User } from './user';
import { JSONContent } from '@tiptap/core';
export declare function getNewContract(id: string, slug: string, creator: User, question: string, outcomeType: outcomeType, description: JSONContent, initialProb: number, ante: number, closeTime: number, extraTags: string[], bucketCount: number, min: number, max: number, isLogScale: boolean, answers: string[], visibility: visibility, isTwitchContract: boolean | undefined): Contract<import("./contract").AnyContractType>;
