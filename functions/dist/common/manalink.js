"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCreateManalink = void 0;
function canCreateManalink(user) {
    const oneWeekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
    return (user.createdTime < oneWeekAgo &&
        (user.balance > 1000 || user.profitCached.allTime > 500));
}
exports.canCreateManalink = canCreateManalink;
//# sourceMappingURL=manalink.js.map