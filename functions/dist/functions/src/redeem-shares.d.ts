import { CPMM2Contract, CPMMContract } from '../../common/contract';
export declare const redeemShares: (userId: string, contract: CPMMContract | CPMM2Contract) => Promise<{
    status: string;
}>;
