"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCommentorsAndBettors = void 0;
const lodash_1 = require("lodash");
const calculate_1 = require("./calculate");
function scoreCommentorsAndBettors(contract, bets, comments) {
    var _a, _b, _c, _d;
    const commentsById = (0, lodash_1.keyBy)(comments, 'id');
    const betsById = (0, lodash_1.keyBy)(bets, 'id');
    // If 'id2' is the sale of 'id1', both are logged with (id2 - id1) of profit
    // Otherwise, we record the profit at resolution time
    const profitById = {};
    for (const bet of bets) {
        if (bet.sale) {
            const originalBet = betsById[bet.sale.betId];
            const profit = bet.sale.amount - originalBet.amount;
            profitById[bet.id] = profit;
            profitById[originalBet.id] = profit;
        }
        else {
            profitById[bet.id] = (0, calculate_1.resolvedPayout)(contract, bet) - bet.amount;
        }
    }
    // Now find the betId with the highest profit
    const topBetId = (_a = (0, lodash_1.sortBy)(bets, (b) => -profitById[b.id])[0]) === null || _a === void 0 ? void 0 : _a.id;
    const topBettor = (_b = betsById[topBetId]) === null || _b === void 0 ? void 0 : _b.userName;
    // And also the commentId of the comment with the highest profit
    const topCommentId = (_c = (0, lodash_1.sortBy)(comments, (c) => c.betId && -profitById[c.betId])[0]) === null || _c === void 0 ? void 0 : _c.id;
    const topCommentBetId = (_d = commentsById[topCommentId]) === null || _d === void 0 ? void 0 : _d.betId;
    return {
        topCommentId,
        topBetId,
        topBettor,
        profitById,
        commentsById,
        betsById,
        topCommentBetId,
    };
}
exports.scoreCommentorsAndBettors = scoreCommentorsAndBettors;
//# sourceMappingURL=scoring.js.map