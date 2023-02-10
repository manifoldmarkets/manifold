"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateLiquidityProvision = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const follow_market_1 = require("./follow-market");
const economy_1 = require("../../common/economy");
const antes_1 = require("../../common/antes");
exports.onCreateLiquidityProvision = functions.firestore
    .document('contracts/{contractId}/liquidity/{liquidityId}')
    .onCreate(async (change, context) => {
    const liquidity = change.data();
    const { eventId } = context;
    // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
    if (liquidity.isAnte ||
        ((liquidity.userId === antes_1.HOUSE_LIQUIDITY_PROVIDER_ID ||
            liquidity.userId === antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID) &&
            (liquidity.amount === economy_1.FIXED_ANTE ||
                liquidity.amount === antes_1.UNIQUE_BETTOR_LIQUIDITY_AMOUNT)))
        return;
    (0, utils_1.log)(`onCreateLiquidityProvision: ${JSON.stringify(liquidity)}`);
    const contract = await (0, utils_1.getContract)(liquidity.contractId);
    if (!contract)
        throw new Error('Could not find contract corresponding with liquidity');
    const liquidityProvider = await (0, utils_1.getUser)(liquidity.userId);
    if (!liquidityProvider)
        throw new Error('Could not find liquidity provider');
    await (0, follow_market_1.addUserToContractFollowers)(contract.id, liquidityProvider.id);
    await (0, create_notification_1.createFollowOrMarketSubsidizedNotification)(contract.id, 'liquidity', 'created', liquidityProvider, eventId, liquidity.amount.toString(), { contract });
});
//# sourceMappingURL=on-create-liquidity-provision.js.map