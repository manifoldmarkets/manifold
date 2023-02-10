"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCardUrl = exports.getOpenGraphProps = exports.getBinaryProb = exports.contractTextDetails = exports.contractMetrics = void 0;
const pseudo_numeric_1 = require("./pseudo-numeric");
const calculate_1 = require("./calculate");
const parse_1 = require("./util/parse");
const calculate_cpmm_1 = require("./calculate-cpmm");
const calculate_dpm_1 = require("./calculate-dpm");
const format_1 = require("./util/format");
const array_1 = require("./util/array");
const constants_1 = require("./envs/constants");
function contractMetrics(contract) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dayjs = require('dayjs');
    const { createdTime, resolutionTime, isResolved } = contract;
    const createdDate = dayjs(createdTime).format('MMM D');
    const resolvedDate = isResolved
        ? dayjs(resolutionTime).format('MMM D')
        : undefined;
    const volumeLabel = `${(0, format_1.formatMoney)(contract.volume)} bet`;
    return { volumeLabel, createdDate, resolvedDate };
}
exports.contractMetrics = contractMetrics;
// String version of the above, to send to the OpenGraph image generator
function contractTextDetails(contract) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dayjs = require('dayjs');
    const { closeTime, groupLinks } = contract;
    const { createdDate, resolvedDate, volumeLabel } = contractMetrics(contract);
    const groupHashtags = groupLinks === null || groupLinks === void 0 ? void 0 : groupLinks.map((g) => `#${g.name.replace(/ /g, '')}`);
    return (`${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
        (closeTime
            ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(closeTime).format('MMM D, h:mma')}`
            : '') +
        ` • ${volumeLabel}` +
        (groupHashtags ? ` • ${groupHashtags.join(' ')}` : ''));
}
exports.contractTextDetails = contractTextDetails;
function getBinaryProb(contract) {
    const { pool, resolutionProbability, mechanism } = contract;
    return (resolutionProbability !== null && resolutionProbability !== void 0 ? resolutionProbability : (mechanism === 'cpmm-1'
        ? (0, calculate_cpmm_1.getCpmmProbability)(pool, contract.p)
        : (0, calculate_dpm_1.getDpmProbability)(contract.totalShares)));
}
exports.getBinaryProb = getBinaryProb;
const getOpenGraphProps = (contract) => {
    const { resolution, question, creatorName, creatorUsername, outcomeType, creatorAvatarUrl, description: desc, } = contract;
    const topAnswer = outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE'
        ? resolution
            ? contract.answers.find((a) => a.id === resolution)
            : (0, calculate_1.getTopAnswer)(contract)
        : undefined;
    const probPercent = outcomeType === 'BINARY'
        ? (0, format_1.formatPercent)(getBinaryProb(contract))
        : topAnswer
            ? (0, format_1.formatPercent)((0, calculate_1.getOutcomeProbability)(contract, topAnswer.id))
            : undefined;
    const numericValue = outcomeType === 'PSEUDO_NUMERIC'
        ? (0, pseudo_numeric_1.getFormattedMappedValue)(contract, contract.resolutionProbability
            ? contract.resolutionProbability
            : (0, calculate_1.getProbability)(contract))
        : undefined;
    const stringDesc = typeof desc === 'string' ? desc : (0, parse_1.richTextToString)(desc);
    const description = resolution
        ? `Resolved ${resolution}. ${stringDesc}`
        : probPercent
            ? `${probPercent} chance. ${stringDesc}`
            : stringDesc;
    return {
        question,
        probability: probPercent,
        metadata: contractTextDetails(contract),
        creatorName,
        creatorUsername,
        creatorAvatarUrl,
        description,
        numericValue,
        resolution,
        topAnswer: topAnswer === null || topAnswer === void 0 ? void 0 : topAnswer.text,
    };
};
exports.getOpenGraphProps = getOpenGraphProps;
function buildCardUrl(props, challenge) {
    var _a;
    const { creatorAmount, acceptances, acceptorAmount, creatorOutcome, acceptorOutcome, } = challenge || {};
    const { userName, userAvatarUrl } = (_a = acceptances === null || acceptances === void 0 ? void 0 : acceptances[0]) !== null && _a !== void 0 ? _a : {};
    const ignoredKeys = ['description'];
    const generateUrlParams = (params) => (0, array_1.filterDefined)(Object.entries(params).map(([key, value]) => !ignoredKeys.includes(key) && value
        ? `${key}=${encodeURIComponent(value)}`
        : null)).join('&');
    const challengeUrlParams = challenge
        ? `&creatorAmount=${creatorAmount}&creatorOutcome=${creatorOutcome}` +
            `&challengerAmount=${acceptorAmount}&challengerOutcome=${acceptorOutcome}` +
            `&acceptedName=${userName !== null && userName !== void 0 ? userName : ''}&acceptedAvatarUrl=${userAvatarUrl !== null && userAvatarUrl !== void 0 ? userAvatarUrl : ''}`
        : '';
    // Change to localhost:3000 for local testing
    const url = 
    // `http://localhost:3000/api/og/market?` +
    `https://${constants_1.DOMAIN}/api/og/market?` +
        generateUrlParams(props) +
        challengeUrlParams;
    return url;
}
exports.buildCardUrl = buildCardUrl;
//# sourceMappingURL=contract-details.js.map