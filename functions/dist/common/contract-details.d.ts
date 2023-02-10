import { Challenge } from './challenge';
import { BinaryContract, Contract } from './contract';
export declare function contractMetrics(contract: Contract): {
    volumeLabel: string;
    createdDate: any;
    resolvedDate: any;
};
export declare function contractTextDetails(contract: Contract): string;
export declare function getBinaryProb(contract: BinaryContract): number;
export declare const getOpenGraphProps: (contract: Contract) => OgCardProps & {
    description: string;
};
export type OgCardProps = {
    question: string;
    probability?: string;
    metadata: string;
    creatorName: string;
    creatorUsername: string;
    creatorAvatarUrl?: string;
    numericValue?: string;
    resolution?: string;
    topAnswer?: string;
};
export declare function buildCardUrl(props: OgCardProps, challenge?: Challenge): string;
