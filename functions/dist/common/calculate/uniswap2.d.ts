export declare function calculatePrice(pool: {
    [outcome: string]: number;
}): number;
export declare function calculateShares(pool: {
    [outcome: string]: number;
}, mana: number): number;
export declare function afterSwap(pool: {
    [outcome: string]: number;
}, token: 'M$' | 'SHARE', amount: number): {
    [x: string]: number;
};
export declare function calculatePriceAfterBuy(pool: {
    [outcome: string]: number;
}, mana: number): number;
