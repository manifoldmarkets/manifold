"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const recommendation_1 = require("common/recommendation");
const lodash_1 = require("lodash");
const file_1 = require("../helpers/file");
const utils_1 = require("../utils");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const update_recommended_1 = require("../update-recommended");
const recommend = async () => {
    console.log('Recommend script');
    let userData = await (0, file_1.readJson)('user-data5.json');
    if (userData) {
        console.log('Loaded view data from file.');
    }
    else {
        console.log('Loading view data from Firestore...');
        userData = await (0, update_recommended_1.loadUserDataForRecommendations)();
        await (0, file_1.writeJson)('user-data5.json', userData);
    }
    console.log('Computing recommendations...');
    const { getUserContractScores } = (0, recommendation_1.getMarketRecommendations)(userData);
    await debug(getUserContractScores);
};
async function debug(getUserContractScores) {
    console.log('Destiny user scores');
    await printUserScores('PKj937RvUZYUbnG7IU8sVPN7XYr1', getUserContractScores);
    console.log('Bembo scores');
    await printUserScores('G3S3nhcGWhPU3WEtlUYbAH4tv7f1', getUserContractScores);
    console.log('Stephen scores');
    await printUserScores('tlmGNz9kjXc2EteizMORes4qvWl2', getUserContractScores);
    console.log('James scores');
    const jamesId = '5LZ4LgYuySdL1huCWe7bti02ghx2';
    await printUserScores(jamesId, getUserContractScores);
}
async function printUserScores(userId, getUserContractScores) {
    const userScores = getUserContractScores(userId);
    const sortedScores = (0, lodash_1.sortBy)(Object.entries(userScores), ([, score]) => -score);
    console.log('top scores', sortedScores.slice(0, 20), (await Promise.all(sortedScores.slice(0, 20).map(([contractId]) => (0, utils_1.getContract)(contractId)))).map((c) => c === null || c === void 0 ? void 0 : c.question));
    console.log('bottom scores', sortedScores.slice(sortedScores.length - 20), (await Promise.all(sortedScores
        .slice(sortedScores.length - 20)
        .map(([contractId]) => (0, utils_1.getContract)(contractId)))).map((c) => c === null || c === void 0 ? void 0 : c.question));
}
if (require.main === module) {
    recommend().then(() => process.exit());
}
//# sourceMappingURL=recommend.js.map