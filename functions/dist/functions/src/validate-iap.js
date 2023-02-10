"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateiap = void 0;
const api_1 = require("./api");
const zod_1 = require("zod");
const utils_1 = require("./utils");
const analytics_1 = require("./analytics");
const admin = require("firebase-admin");
const antes_1 = require("../../common/antes");
const emails_1 = require("./emails");
const run_txn_1 = require("./run-txn");
const bodySchema = zod_1.z.object({
    receipt: zod_1.z.string(),
});
const PRODUCTS_TO_AMOUNTS = {
    mana_1000: 1000,
    mana_2500: 2500,
    mana_10000: 10000,
};
const IAP_TYPES_PROCESSED = 'apple';
const opts = { secrets: ['MAILGUN_KEY'] };
exports.validateiap = (0, api_1.newEndpoint)(opts, async (req, auth) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iap = require('@flat/in-app-purchase');
    const { receipt } = (0, api_1.validate)(bodySchema, req.body);
    const userId = auth.uid;
    iap.config({
        test: !(0, utils_1.isProd)(),
        verbose: true, // Output debug logs to stdout stream
    });
    await iap.setup().catch((error) => {
        (0, utils_1.log)('Error setting up iap', error);
        throw new api_1.APIError(400, 'iap setup failed');
    });
    const validatedData = await iap.validate(receipt).catch((error) => {
        (0, utils_1.log)('error on validate data:', error);
        throw new api_1.APIError(400, 'iap receipt validation failed');
    });
    // TODO uncomment this after app is accepted by Apple.
    (0, utils_1.log)('validated data, sandbox:', validatedData.sandbox);
    // if (isProd() && validatedData.sandbox) {
    // Apple wants a successful response even if the receipt is from the sandbox,
    // so we just return success here and don't transfer any mana.
    // return { success: true }
    // }
    const options = {
        ignoreCanceled: true,
        ignoreExpired: true, // purchaseData will NOT contain exipired subscription items
    };
    // validatedData contains sandbox: true/false for Apple and Amazon
    const purchaseData = iap.getPurchaseData(validatedData, options);
    (0, utils_1.log)('purchase data:', purchaseData);
    const { transactionId, productId, purchaseDateMs, quantity } = purchaseData[0];
    const query = await firestore
        .collection('iaps')
        .where('transactionId', '==', transactionId)
        .get();
    if (!query.empty) {
        (0, utils_1.log)('transactionId', transactionId, 'already processed');
        throw new api_1.APIError(400, 'iap transaction already processed');
    }
    const payout = PRODUCTS_TO_AMOUNTS[productId] * quantity;
    const revenue = (payout / 100) * 0.2 + payout / 100 - 0.01;
    (0, utils_1.log)('payout', payout);
    const iapTransRef = await firestore.collection('iaps').doc();
    const iapTransaction = {
        userId,
        manaQuantity: payout,
        createdTime: Date.now(),
        purchaseTime: purchaseDateMs,
        transactionId,
        quantity,
        receipt,
        productId,
        type: IAP_TYPES_PROCESSED,
        revenue,
        id: iapTransRef.id,
    };
    (0, utils_1.log)('iap transaction:', iapTransaction);
    await firestore.collection('iaps').doc(iapTransRef.id).set(iapTransaction);
    const manaPurchaseTxn = {
        fromId: (0, utils_1.isProd)()
            ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
            : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        amount: payout,
        token: 'M$',
        category: 'MANA_PURCHASE',
        data: {
            iapTransactionId: iapTransRef.id,
            type: IAP_TYPES_PROCESSED,
        },
        description: `Deposit M$${payout} from BANK for mana purchase`,
    };
    await firestore.runTransaction(async (transaction) => {
        var _a;
        const result = await (0, run_txn_1.runTxn)(transaction, manaPurchaseTxn);
        if (result.status == 'error') {
            throw new api_1.APIError(500, (_a = result.message) !== null && _a !== void 0 ? _a : 'An unknown error occurred.');
        }
        return result;
    });
    (0, utils_1.log)('user', userId, 'paid M$', payout);
    const user = await (0, utils_1.getUser)(userId);
    if (!user)
        throw new api_1.APIError(400, 'user not found');
    const privateUser = await (0, utils_1.getPrivateUser)(userId);
    if (!privateUser)
        throw new api_1.APIError(400, 'private user not found');
    await (0, emails_1.sendThankYouEmail)(user, privateUser);
    (0, utils_1.log)('iap revenue', revenue);
    await (0, analytics_1.track)(userId, 'M$ purchase', { amount: payout, transactionId }, { revenue });
    return { success: true };
});
const firestore = admin.firestore();
//# sourceMappingURL=validate-iap.js.map