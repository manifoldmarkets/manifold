import { Answer } from './answer';
import { Fees } from './fees';
import { JSONContent } from '@tiptap/core';
import { GroupLink } from 'common/group';
export type AnyOutcomeType = Binary | MultipleChoice | PseudoNumeric | FreeResponse | Numeric | Cert | QuadraticFunding;
export type AnyContractType = (CPMM & Binary) | (CPMM & PseudoNumeric) | (DPM & Binary) | (DPM & FreeResponse) | (DPM & Numeric) | (DPM & MultipleChoice) | (Uniswap2 & Cert) | (CPMM2 & MultipleChoice) | QuadraticFunding;
export type Contract<T extends AnyContractType = AnyContractType> = {
    id: string;
    slug: string;
    creatorId: string;
    creatorName: string;
    creatorUsername: string;
    creatorAvatarUrl?: string;
    creatorCreatedTime?: number;
    question: string;
    description: string | JSONContent;
    tags: string[];
    lowercaseTags: string[];
    visibility: visibility;
    createdTime: number;
    lastUpdatedTime?: number;
    lastBetTime?: number;
    lastCommentTime?: number;
    closeTime?: number;
    isResolved: boolean;
    resolutionTime?: number;
    resolution?: string;
    resolutionProbability?: number;
    closeEmailsSent?: number;
    volume: number;
    volume24Hours: number;
    elasticity: number;
    collectedFees: Fees;
    groupSlugs?: string[];
    groupLinks?: GroupLink[];
    uniqueBettorIds?: string[];
    uniqueBettorCount?: number;
    uniqueBettors24Hours?: number;
    uniqueBettors7Days?: number;
    uniqueBettors30Days?: number;
    popularityScore?: number;
    dailyScore?: number;
    followerCount?: number;
    likedByUserCount?: number;
    flaggedByUsernames?: string[];
    unlistedById?: string;
    featuredLabel?: string;
    isTwitchContract?: boolean;
    coverImageUrl?: string;
} & T;
export type DPMContract = Contract & DPM;
export type CPMMContract = Contract & CPMM;
export type CPMM2Contract = Contract & CPMM2;
export type BinaryContract = Contract & Binary;
export type DPMBinaryContract = BinaryContract & DPM;
export type CPMMBinaryContract = BinaryContract & CPMM;
export type PseudoNumericContract = Contract & PseudoNumeric;
export type NumericContract = Contract & Numeric;
export type FreeResponseContract = Contract & FreeResponse;
export type MultipleChoiceContract = Contract & MultipleChoice;
export type CertContract = Contract & Cert;
export type Uniswap2CertContract = CertContract & Uniswap2;
export type DpmMultipleChoiceContract = Contract & MultipleChoice & DPM;
export type CPMMMultipleChoiceContract = Contract & MultipleChoice & CPMM2;
export type QuadraticFundingContract = Contract & QuadraticFunding;
export type BinaryOrPseudoNumericContract = CPMMBinaryContract | PseudoNumericContract;
export type DPM = {
    mechanism: 'dpm-2';
    pool: {
        [outcome: string]: number;
    };
    phantomShares?: {
        [outcome: string]: number;
    };
    totalShares: {
        [outcome: string]: number;
    };
    totalBets: {
        [outcome: string]: number;
    };
};
export type CPMM2 = {
    mechanism: 'cpmm-2';
    pool: {
        [outcome: string]: number;
    };
    subsidyPool: number;
};
export type CPMM = {
    mechanism: 'cpmm-1';
    pool: {
        [outcome: string]: number;
    };
    p: number;
    totalLiquidity: number;
    subsidyPool: number;
    prob: number;
    probChanges: {
        day: number;
        week: number;
        month: number;
    };
};
export type Uniswap2 = {
    mechanism: 'uniswap-2';
    pool: {
        [outcome: string]: number;
    };
    price: number;
};
export type Cert = {
    outcomeType: 'CERT';
};
export type QuadraticFunding = {
    outcomeType: 'QUADRATIC_FUNDING';
    mechanism: 'qf';
    answers: Answer[];
    pool: {
        M$: number;
    };
    resolution?: 'MKT' | 'CANCEL';
    resolutions?: {
        [outcome: string]: number;
    };
};
export type Binary = {
    outcomeType: 'BINARY';
    initialProbability: number;
    resolutionProbability?: number;
    resolution?: resolution;
};
export type PseudoNumeric = {
    outcomeType: 'PSEUDO_NUMERIC';
    min: number;
    max: number;
    isLogScale: boolean;
    resolutionValue?: number;
    initialProbability: number;
    resolutionProbability?: number;
};
export type FreeResponse = {
    outcomeType: 'FREE_RESPONSE';
    answers: Answer[];
    resolution?: string | 'MKT' | 'CANCEL';
    resolutions?: {
        [outcome: string]: number;
    };
};
export type MultipleChoice = {
    outcomeType: 'MULTIPLE_CHOICE';
    answers: Answer[];
    resolution?: string | 'MKT' | 'CANCEL';
    resolutions?: {
        [outcome: string]: number;
    };
};
export type Numeric = {
    outcomeType: 'NUMERIC';
    bucketCount: number;
    min: number;
    max: number;
    resolutions?: {
        [outcome: string]: number;
    };
    resolutionValue?: number;
};
export type outcomeType = AnyOutcomeType['outcomeType'];
export type resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL';
export declare const RESOLUTIONS: readonly ["YES", "NO", "MKT", "CANCEL"];
export declare const OUTCOME_TYPES: readonly ["BINARY", "MULTIPLE_CHOICE", "FREE_RESPONSE", "PSEUDO_NUMERIC", "NUMERIC", "CERT", "QUADRATIC_FUNDING"];
export declare const MAX_QUESTION_LENGTH = 240;
export declare const MAX_DESCRIPTION_LENGTH = 16000;
export declare const MAX_TAG_LENGTH = 60;
export declare const CPMM_MIN_POOL_QTY = 0.01;
export type visibility = 'public' | 'unlisted';
export declare const VISIBILITIES: readonly ["public", "unlisted"];
