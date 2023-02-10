export declare function getProb(pool: {
    [outcome: string]: number;
}, outcome: string): number;
export declare function poolToProbs(pool: {
    [outcome: string]: number;
}): {
    [x: string]: number;
};
export declare const getLiquidity: (pool: {
    [outcome: string]: number;
}) => number;
export declare function buy(pool: {
    [outcome: string]: number;
}, outcome: string, amount: number): {
    newPool: {
        [x: string]: number;
    };
    shares: number;
};
export declare function sell(pool: {
    [outcome: string]: number;
}, outcome: string, shares: number): {
    newPool: {
        [x: string]: number;
    };
    saleAmount: number;
};
export declare function shortSell(pool: {
    [outcome: string]: number;
}, outcome: string, amount: number): {
    newPool: {
        [x: string]: number;
    };
    gainedShares: {
        [x: string]: number;
    };
};
export declare function test(): void;
