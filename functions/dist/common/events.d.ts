export type UserEvent = {
    name: string;
    timestamp: number;
};
export type ContractCardView = {
    slug: string;
    contractId: string;
    creatorId: string;
    name: 'view market card';
    timestamp: number;
};
export type ContractView = {
    slug: string;
    contractId: string;
    creatorId: string;
    name: 'view market';
    timestamp: number;
};
