"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNoBadgeWithCurrentOrGreaterPropertyNumber = exports.getBadgesByRarity = exports.calculateBadgeRarity = exports.marketCreatorBadgeRarityThresholds = exports.streakerBadgeRarityThresholds = exports.provenCorrectRarityThresholds = exports.MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE = void 0;
exports.MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE = 5;
exports.provenCorrectRarityThresholds = [1, 1000, 10000];
const calculateProvenCorrectBadgeRarity = (badge) => {
    const { betAmount } = badge.data;
    const thresholdArray = exports.provenCorrectRarityThresholds;
    let i = thresholdArray.length - 1;
    while (i >= 0) {
        if (betAmount >= thresholdArray[i]) {
            return i + 1;
        }
        i--;
    }
    return 1;
};
exports.streakerBadgeRarityThresholds = [1, 50, 250];
const calculateStreakerBadgeRarity = (badge) => {
    const { totalBettingStreak } = badge.data;
    const thresholdArray = exports.streakerBadgeRarityThresholds;
    let i = thresholdArray.length - 1;
    while (i >= 0) {
        if (totalBettingStreak == thresholdArray[i]) {
            return i + 1;
        }
        i--;
    }
    return 1;
};
exports.marketCreatorBadgeRarityThresholds = [1, 75, 300];
const calculateMarketCreatorBadgeRarity = (badge) => {
    const { totalContractsCreated } = badge.data;
    const thresholdArray = exports.marketCreatorBadgeRarityThresholds;
    let i = thresholdArray.length - 1;
    while (i >= 0) {
        if (totalContractsCreated == thresholdArray[i]) {
            return i + 1;
        }
        i--;
    }
    return 1;
};
const rarityRanks = {
    1: 'bronze',
    2: 'silver',
    3: 'gold',
};
const calculateBadgeRarity = (badge) => {
    switch (badge.type) {
        case 'PROVEN_CORRECT':
            return rarityRanks[calculateProvenCorrectBadgeRarity(badge)];
        case 'MARKET_CREATOR':
            return rarityRanks[calculateMarketCreatorBadgeRarity(badge)];
        case 'STREAKER':
            return rarityRanks[calculateStreakerBadgeRarity(badge)];
        default:
            return rarityRanks[0];
    }
};
exports.calculateBadgeRarity = calculateBadgeRarity;
const getBadgesByRarity = (user) => {
    const rarities = {
        bronze: 0,
        silver: 0,
        gold: 0,
    };
    if (!user)
        return rarities;
    Object.values(user.achievements).map((value) => {
        value.badges.map((badge) => {
            var _a;
            rarities[(0, exports.calculateBadgeRarity)(badge)] =
                ((_a = rarities[(0, exports.calculateBadgeRarity)(badge)]) !== null && _a !== void 0 ? _a : 0) + 1;
        });
    });
    return rarities;
};
exports.getBadgesByRarity = getBadgesByRarity;
// Check the badges for the numeric property, return if they have a badge with that award or greater already
const hasNoBadgeWithCurrentOrGreaterPropertyNumber = (badges, property, currentNumber) => {
    if (!badges)
        return true;
    const hasBadge = badges.find((badge) => {
        return ((badge.data[property] && badge.data[property] === currentNumber) ||
            (badge.data[property] && badge.data[property] > currentNumber));
    });
    return !hasBadge;
};
exports.hasNoBadgeWithCurrentOrGreaterPropertyNumber = hasNoBadgeWithCurrentOrGreaterPropertyNumber;
//# sourceMappingURL=badge.js.map