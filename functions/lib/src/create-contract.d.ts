import { Contract } from '../../common/contract';
export declare const createmarket: import("./api").EndpointDefinition;
export declare function getContractFromSlug(slug: string): Promise<Contract<import("../../common/contract").AnyContractType> | undefined>;
