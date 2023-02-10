"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const lodash_1 = require("lodash");
const array_1 = require("common/util/array");
const resolve_market_1 = require("../resolve-market");
const utils_1 = require("../utils");
if (require.main === module) {
    const contractIds = process.argv.slice(2);
    if (contractIds.length === 0) {
        throw new Error('No contract ids provided');
    }
    resolveMarketsAgain(contractIds).then(() => process.exit(0));
}
async function resolveMarketsAgain(contractIds) {
    const maybeContracts = await Promise.all(contractIds.map(utils_1.getContract));
    if (maybeContracts.some((c) => !c)) {
        throw new Error('Invalid contract id');
    }
    const contracts = (0, array_1.filterDefined)(maybeContracts);
    const maybeCreators = await Promise.all(contracts.map((c) => (0, utils_1.getUser)(c.creatorId)));
    if (maybeCreators.some((c) => !c)) {
        throw new Error('No creator found');
    }
    const creators = (0, array_1.filterDefined)(maybeCreators);
    if (!contracts.every((c) => c.resolution === 'YES' || c.resolution === 'NO')) {
        throw new Error('Only YES or NO resolutions supported');
    }
    const resolutionParams = contracts.map((c) => ({
        outcome: c.resolution,
        value: undefined,
        probabilityInt: undefined,
        resolutions: undefined,
    }));
    const params = (0, lodash_1.zip)(contracts, creators, resolutionParams);
    for (const [contract, creator, resolutionParams] of params) {
        if (contract && creator && resolutionParams) {
            console.log('Resolving', contract.question);
            try {
                await (0, resolve_market_1.resolveMarket)(contract, creator, resolutionParams);
            }
            catch (e) {
                console.log(e);
            }
        }
    }
    console.log(`Resolved all contracts.`);
}
//# sourceMappingURL=resolve-markets-again.js.map