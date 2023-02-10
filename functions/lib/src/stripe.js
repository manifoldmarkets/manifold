"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripewebhook = exports.createcheckoutsession = void 0;
const admin = require("firebase-admin");
const stripe_1 = require("stripe");
const utils_1 = require("./utils");
const emails_1 = require("./emails");
const analytics_1 = require("./analytics");
const initStripe = () => {
    const apiKey = process.env.STRIPE_APIKEY;
    return new stripe_1.default(apiKey, { apiVersion: '2020-08-27', typescript: true });
};
// manage at https://dashboard.stripe.com/test/products?active=true
const manticDollarStripePrice = (0, utils_1.isProd)()
    ? {
        500: 'price_1KFQXcGdoFKoCJW770gTNBrm',
        1000: 'price_1KFQp1GdoFKoCJW7Iu0dsF65',
        2500: 'price_1KFQqNGdoFKoCJW7SDvrSaEB',
        10000: 'price_1KFQraGdoFKoCJW77I4XCwM3',
    }
    : {
        500: 'price_1K8W10GdoFKoCJW7KWORLec1',
        1000: 'price_1K8bC1GdoFKoCJW76k3g5MJk',
        2500: 'price_1K8bDSGdoFKoCJW7avAwpV0e',
        10000: 'price_1K8bEiGdoFKoCJW7Us4UkRHE',
    };
exports.createcheckoutsession = {
    opts: { method: 'POST', minInstances: 1, secrets: ['STRIPE_APIKEY'] },
    handler: async (req, res) => {
        var _a, _b;
        const userId = (_a = req.query.userId) === null || _a === void 0 ? void 0 : _a.toString();
        const manticDollarQuantity = (_b = req.query.manticDollarQuantity) === null || _b === void 0 ? void 0 : _b.toString();
        if (!userId) {
            res.status(400).send('Invalid user ID');
            return;
        }
        if (!manticDollarQuantity ||
            !Object.keys(manticDollarStripePrice).includes(manticDollarQuantity)) {
            res.status(400).send('Invalid Mantic Dollar quantity');
            return;
        }
        const referrer = req.query.referer || req.headers.referer || 'https://manifold.markets';
        const stripe = initStripe();
        const session = await stripe.checkout.sessions.create({
            metadata: {
                userId,
                manticDollarQuantity,
            },
            line_items: [
                {
                    price: manticDollarStripePrice[manticDollarQuantity],
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${referrer}?funding-success`,
            cancel_url: `${referrer}?funding-failiure`,
        });
        res.redirect(303, session.url || '');
    },
};
exports.stripewebhook = {
    opts: {
        method: 'POST',
        minInstances: 1,
        secrets: ['MAILGUN_KEY', 'STRIPE_APIKEY', 'STRIPE_WEBHOOKSECRET'],
    },
    handler: async (req, res) => {
        var _a;
        const stripe = initStripe();
        let event;
        try {
            // Cloud Functions jam the raw body into a special `rawBody` property
            const rawBody = (_a = req.rawBody) !== null && _a !== void 0 ? _a : req.body;
            event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOKSECRET);
        }
        catch (e) {
            console.log(`Webhook Error: ${e.message}`);
            res.status(400).send(`Webhook Error: ${e.message}`);
            return;
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            await issueMoneys(session);
        }
        res.status(200).send('success');
    },
};
const issueMoneys = async (session) => {
    const { id: sessionId } = session;
    const { userId, manticDollarQuantity } = session.metadata;
    const deposit = Number.parseInt(manticDollarQuantity);
    const success = await firestore.runTransaction(async (trans) => {
        const query = await trans.get(firestore
            .collection('stripe-transactions')
            .where('sessionId', '==', sessionId));
        if (!query.empty) {
            console.log('session', sessionId, 'already processed');
            return false;
        }
        const stripeDoc = firestore.collection('stripe-transactions').doc();
        trans.set(stripeDoc, {
            userId,
            manticDollarQuantity: deposit,
            sessionId,
            session,
            timestamp: Date.now(),
        });
        (0, utils_1.payUsers)(trans, [{ userId, payout: deposit, deposit }]);
        return true;
    });
    if (success) {
        console.log('user', userId, 'paid M$', deposit);
        const user = await (0, utils_1.getUser)(userId);
        if (!user)
            return;
        const privateUser = await (0, utils_1.getPrivateUser)(userId);
        if (!privateUser)
            return;
        await (0, emails_1.sendThankYouEmail)(user, privateUser);
        await (0, analytics_1.track)(userId, 'M$ purchase', { amount: deposit, sessionId }, { revenue: deposit / 100 });
    }
};
const firestore = admin.firestore();
//# sourceMappingURL=stripe.js.map