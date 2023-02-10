export type LiquidityProvision = {
    id: string;
    userId: string;
    contractId: string;
    createdTime: number;
    isAnte?: boolean;
    amount: number;
    pool: {
        [outcome: string]: number;
    };
    liquidity: number;
};
