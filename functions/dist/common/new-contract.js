"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNewContract = void 0;
const lodash_1 = require("lodash");
const object_1 = require("./util/object");
const calculate_metrics_1 = require("./calculate-metrics");
function getNewContract(id, slug, creator, question, outcomeType, description, initialProb, ante, closeTime, extraTags, 
// used for numeric markets
bucketCount, min, max, isLogScale, 
// for multiple choice
answers, visibility, 
// twitch
isTwitchContract) {
    const createdTime = Date.now();
    const propsByOutcomeType = {
        BINARY: () => getBinaryCpmmProps(initialProb, ante),
        PSEUDO_NUMERIC: () => getPseudoNumericCpmmProps(initialProb, ante, min, max, isLogScale),
        NUMERIC: () => getNumericProps(ante, bucketCount, min, max),
        MULTIPLE_CHOICE: () => getDpmMultipleChoiceProps(ante, answers),
        QUADRATIC_FUNDING: () => getQfProps(ante),
        CERT: () => getCertProps(ante),
        FREE_RESPONSE: () => getFreeAnswerProps(ante),
    }[outcomeType]();
    const contract = (0, object_1.removeUndefinedProps)(Object.assign(Object.assign({ id,
        slug }, propsByOutcomeType), { creatorId: creator.id, creatorName: creator.name, creatorUsername: creator.username, creatorAvatarUrl: creator.avatarUrl, creatorCreatedTime: creator.createdTime, question: question.trim(), description, tags: [], lowercaseTags: [], visibility, unlistedById: visibility === 'unlisted' ? creator.id : undefined, isResolved: false, createdTime,
        closeTime, volume: 0, volume24Hours: 0, elasticity: propsByOutcomeType.mechanism === 'cpmm-1'
            ? (0, calculate_metrics_1.computeBinaryCpmmElasticityFromAnte)(ante)
            : 4.99, collectedFees: {
            creatorFee: 0,
            liquidityFee: 0,
            platformFee: 0,
        }, isTwitchContract }));
    return contract;
}
exports.getNewContract = getNewContract;
/*
import { PHANTOM_ANTE } from './antes'
import { calcDpmInitialPool } from './calculate-dpm'
const getBinaryDpmProps = (initialProb: number, ante: number) => {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcDpmInitialPool(initialProb, ante, PHANTOM_ANTE)

  const system: DPM & Binary = {
    mechanism: 'dpm-2',
    outcomeType: 'BINARY',
    initialProbability: initialProb / 100,
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
  }

  return system
}
*/
const getBinaryCpmmProps = (initialProb, ante) => {
    const pool = { YES: ante, NO: ante };
    const p = initialProb / 100;
    const system = {
        mechanism: 'cpmm-1',
        outcomeType: 'BINARY',
        totalLiquidity: ante,
        subsidyPool: 0,
        initialProbability: p,
        p,
        pool: pool,
        prob: initialProb,
        probChanges: { day: 0, week: 0, month: 0 },
    };
    return system;
};
const getPseudoNumericCpmmProps = (initialProb, ante, min, max, isLogScale) => {
    const system = Object.assign(Object.assign({}, getBinaryCpmmProps(initialProb, ante)), { outcomeType: 'PSEUDO_NUMERIC', min,
        max,
        isLogScale });
    return system;
};
const getCertProps = (ante) => {
    const system = {
        mechanism: 'uniswap-2',
        outcomeType: 'CERT',
        pool: {
            SHARE: ante,
            M$: ante,
        },
        // TODO: Update price in the cert when trades happen
        price: 1,
    };
    return system;
};
const getQfProps = (ante) => {
    const system = {
        outcomeType: 'QUADRATIC_FUNDING',
        mechanism: 'qf',
        answers: [],
        pool: { M$: ante },
    };
    return system;
};
const getFreeAnswerProps = (ante) => {
    const system = {
        mechanism: 'dpm-2',
        outcomeType: 'FREE_RESPONSE',
        pool: { '0': ante },
        totalShares: { '0': ante },
        totalBets: { '0': ante },
        answers: [],
    };
    return system;
};
const getDpmMultipleChoiceProps = (ante, answers) => {
    const numAnswers = answers.length;
    const betAnte = ante / numAnswers;
    const betShares = Math.sqrt(ante ** 2 / numAnswers);
    const defaultValues = (x) => Object.fromEntries((0, lodash_1.range)(0, numAnswers).map((k) => [k, x]));
    const system = {
        mechanism: 'dpm-2',
        outcomeType: 'MULTIPLE_CHOICE',
        pool: defaultValues(betAnte),
        totalShares: defaultValues(betShares),
        totalBets: defaultValues(betAnte),
        answers: [],
    };
    return system;
};
// TODO (James): Remove.
const _getMultipleChoiceProps = (creator, ante, answers, createdTime, contractId) => {
    const numAnswers = answers.length;
    const pool = Object.fromEntries((0, lodash_1.range)(0, numAnswers).map((k) => [k, ante]));
    const { username, name, avatarUrl } = creator;
    const answerObjects = answers.map((answer, i) => ({
        id: i.toString(),
        number: i,
        contractId,
        createdTime,
        userId: creator.id,
        username,
        name,
        avatarUrl,
        text: answer,
    }));
    const system = {
        mechanism: 'cpmm-2',
        outcomeType: 'MULTIPLE_CHOICE',
        pool,
        answers: answerObjects,
        subsidyPool: 0,
    };
    return system;
};
const getNumericProps = (ante, bucketCount, min, max) => {
    const buckets = (0, lodash_1.range)(0, bucketCount).map((i) => i.toString());
    const betAnte = ante / bucketCount;
    const pool = Object.fromEntries(buckets.map((answer) => [answer, betAnte]));
    const totalBets = pool;
    const betShares = Math.sqrt(ante ** 2 / bucketCount);
    const totalShares = Object.fromEntries(buckets.map((answer) => [answer, betShares]));
    const system = {
        mechanism: 'dpm-2',
        outcomeType: 'NUMERIC',
        pool,
        totalBets,
        totalShares,
        bucketCount,
        min,
        max,
    };
    return system;
};
//# sourceMappingURL=new-contract.js.map