import { Bet } from '../../common/bet';
import { Contract } from '../../common/contract';
export declare function getFeedContracts(): Promise<Contract<import("../../common/contract").AnyContractType>[]>;
export declare function getTaggedContracts(tag: string): Promise<Contract<import("../../common/contract").AnyContractType>[]>;
export declare function getRecentBetsAndComments(contractId: string): Promise<{
    recentBets: Bet[];
    recentComments: Comment[];
}>;
