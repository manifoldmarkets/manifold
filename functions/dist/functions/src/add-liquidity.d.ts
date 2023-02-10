import { CPMMContract } from '../../common/contract';
export declare const addliquidity: import("./api").EndpointDefinition;
export declare const addHouseLiquidity: (contract: CPMMContract, amount: number) => Promise<void>;
