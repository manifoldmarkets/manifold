"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentContractLikes = void 0;
async function getRecentContractLikes(db, since) {
    var _a;
    const response = await db.rpc('recently_liked_contract_counts', {
        since,
    });
    const likesByContract = Object.fromEntries(((_a = response.data) !== null && _a !== void 0 ? _a : []).flat().map(({ contract_id, n }) => [contract_id, n]));
    return likesByContract;
}
exports.getRecentContractLikes = getRecentContractLikes;
//# sourceMappingURL=likes.js.map