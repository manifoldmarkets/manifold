import { Contract } from '../../common/contract';
import { User } from 'common/user';
export declare const resolvemarket: import("./api").EndpointDefinition;
export declare const resolveMarket: (unresolvedContract: Contract, creator: User, { value, resolutions, probabilityInt, outcome }: ResolutionParams) => Promise<Contract<import("../../common/contract").AnyContractType>>;
declare function getResolutionParams(contract: Contract, body: string): {
    resolutions: undefined;
    probabilityInt: undefined;
    value?: number | undefined;
    outcome: string;
} | {
    resolutions: undefined;
    outcome: "CANCEL";
    value?: undefined;
    probabilityInt?: undefined;
} | {
    resolutions: undefined;
    value: number;
    outcome: "MKT";
    probabilityInt: number;
} | {
    outcome: string;
    resolutions: {
        [k: string]: number;
    };
    value: undefined;
    probabilityInt: undefined;
} | {
    value: undefined;
    resolutions: undefined;
    probabilityInt?: number | undefined;
    outcome: "YES" | "NO" | "MKT" | "CANCEL";
};
type ResolutionParams = ReturnType<typeof getResolutionParams>;
export {};
