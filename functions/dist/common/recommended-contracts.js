"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContractScore = exports.getWordScores = exports.getRecommendedContracts = exports.MAX_FEED_CONTRACTS = void 0;
const lodash_1 = require("lodash");
const array_1 = require("./util/array");
const object_1 = require("./util/object");
exports.MAX_FEED_CONTRACTS = 75;
const getRecommendedContracts = (contractsById, yourBetOnContractIds) => {
    const contracts = Object.values(contractsById);
    const yourContracts = (0, array_1.filterDefined)(yourBetOnContractIds.map((contractId) => contractsById[contractId]));
    const yourContractIds = new Set(yourContracts.map((c) => c.id));
    const notYourContracts = contracts.filter((c) => !yourContractIds.has(c.id));
    const yourWordFrequency = contractsToWordFrequency(yourContracts);
    const otherWordFrequency = contractsToWordFrequency(notYourContracts);
    const words = (0, lodash_1.union)(Object.keys(yourWordFrequency), Object.keys(otherWordFrequency));
    const yourWeightedFrequency = Object.fromEntries(words.map((word) => {
        var _a, _b;
        const [yourFreq, otherFreq] = [
            (_a = yourWordFrequency[word]) !== null && _a !== void 0 ? _a : 0,
            (_b = otherWordFrequency[word]) !== null && _b !== void 0 ? _b : 0,
        ];
        const score = yourFreq / (yourFreq + otherFreq + 0.0001);
        return [word, score];
    }));
    // console.log(
    //   'your weighted frequency',
    //   _.sortBy(_.toPairs(yourWeightedFrequency), ([, freq]) => -freq)
    // )
    const scoredContracts = contracts.map((contract) => {
        const wordFrequency = contractToWordFrequency(contract);
        const score = (0, lodash_1.sumBy)(Object.keys(wordFrequency), (word) => {
            var _a, _b;
            const wordFreq = (_a = wordFrequency[word]) !== null && _a !== void 0 ? _a : 0;
            const weight = (_b = yourWeightedFrequency[word]) !== null && _b !== void 0 ? _b : 0;
            return wordFreq * weight;
        });
        return {
            contract,
            score,
        };
    });
    return (0, lodash_1.sortBy)(scoredContracts, (scored) => -scored.score).map((scored) => scored.contract);
};
exports.getRecommendedContracts = getRecommendedContracts;
const contractToText = (contract) => {
    const { description, question, tags, creatorUsername } = contract;
    return `${creatorUsername} ${question} ${tags.join(' ')} ${description}`;
};
const MAX_CHARS_IN_WORD = 100;
const getWordsCount = (text) => {
    const normalizedText = text.replace(/[^a-zA-Z]/g, ' ').toLowerCase();
    const words = normalizedText
        .split(' ')
        .filter((word) => word)
        .filter((word) => word.length <= MAX_CHARS_IN_WORD);
    const counts = {};
    for (const word of words) {
        if (counts[word])
            counts[word]++;
        else
            counts[word] = 1;
    }
    return counts;
};
const toFrequency = (counts) => {
    const total = (0, lodash_1.sum)(Object.values(counts));
    return (0, lodash_1.mapValues)(counts, (count) => count / total);
};
const contractToWordFrequency = (contract) => toFrequency(getWordsCount(contractToText(contract)));
const contractsToWordFrequency = (contracts) => {
    const frequencySum = contracts
        .map(contractToWordFrequency)
        .reduce(object_1.addObjects, {});
    return toFrequency(frequencySum);
};
const getWordScores = (contracts, contractViewCounts, clicks, bets) => {
    const contractClicks = (0, lodash_1.groupBy)(clicks, (click) => click.contractId);
    const contractBets = (0, lodash_1.groupBy)(bets, (bet) => bet.contractId);
    const yourContracts = contracts.filter((c) => contractViewCounts[c.id] || contractClicks[c.id] || contractBets[c.id]);
    const yourTfIdf = calculateContractTfIdf(yourContracts);
    const contractWordScores = (0, lodash_1.mapValues)(yourTfIdf, (wordsTfIdf, contractId) => {
        var _a, _b, _c, _d, _e;
        const viewCount = (_a = contractViewCounts[contractId]) !== null && _a !== void 0 ? _a : 0;
        const clickCount = (_c = (_b = contractClicks[contractId]) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0;
        const betCount = (_e = (_d = contractBets[contractId]) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
        const factor = -1 * Math.log(viewCount + 1) +
            10 * Math.log(betCount + clickCount / 4 + 1);
        return (0, lodash_1.mapValues)(wordsTfIdf, (tfIdf) => tfIdf * factor);
    });
    const wordScores = Object.values(contractWordScores).reduce(object_1.addObjects, {});
    const minScore = Math.min(...Object.values(wordScores));
    const maxScore = Math.max(...Object.values(wordScores));
    const normalizedWordScores = (0, lodash_1.mapValues)(wordScores, (score) => (score - minScore) / (maxScore - minScore));
    // console.log(
    //   'your word scores',
    //   _.sortBy(_.toPairs(normalizedWordScores), ([, score]) => -score).slice(0, 100),
    //   _.sortBy(_.toPairs(normalizedWordScores), ([, score]) => -score).slice(-100)
    // )
    return normalizedWordScores;
};
exports.getWordScores = getWordScores;
function getContractScore(contract, wordScores) {
    if (Object.keys(wordScores).length === 0)
        return 1;
    const wordFrequency = contractToWordFrequency(contract);
    const score = (0, lodash_1.sumBy)(Object.keys(wordFrequency), (word) => {
        var _a, _b;
        const wordFreq = (_a = wordFrequency[word]) !== null && _a !== void 0 ? _a : 0;
        const weight = (_b = wordScores[word]) !== null && _b !== void 0 ? _b : 0;
        return wordFreq * weight;
    });
    return score;
}
exports.getContractScore = getContractScore;
// Caluculate Term Frequency-Inverse Document Frequency (TF-IDF):
// https://medium.datadriveninvestor.com/tf-idf-in-natural-language-processing-8db8ef4a7736
function calculateContractTfIdf(contracts) {
    var _a;
    const contractFreq = contracts.map((c) => contractToWordFrequency(c));
    const contractWords = contractFreq.map((freq) => Object.keys(freq));
    const wordsCount = {};
    for (const words of contractWords) {
        for (const word of words) {
            wordsCount[word] = ((_a = wordsCount[word]) !== null && _a !== void 0 ? _a : 0) + 1;
        }
    }
    const wordIdf = (0, lodash_1.mapValues)(wordsCount, (count) => Math.log(contracts.length / count));
    const contractWordsTfIdf = contractFreq.map((wordFreq) => (0, lodash_1.mapValues)(wordFreq, (freq, word) => freq * wordIdf[word]));
    return Object.fromEntries(contracts.map((c, i) => [c.id, contractWordsTfIdf[i]]));
}
//# sourceMappingURL=recommended-contracts.js.map