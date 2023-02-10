import { CPMMContract } from './contract';
import { LiquidityProvision } from './liquidity-provision';
export declare const getNewLiquidityProvision: (userId: string, amount: number, contract: CPMMContract, newLiquidityProvisionId: string) => {
    newLiquidityProvision: LiquidityProvision;
    newTotalLiquidity: number;
    newSubsidyPool: number;
};
