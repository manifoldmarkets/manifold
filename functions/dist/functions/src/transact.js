"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transact = void 0;
const admin = require("firebase-admin");
const api_1 = require("./api");
const run_txn_1 = require("./run-txn");
// TODO: We totally fail to validate most of the input to this function,
// so anyone can spam our database with malformed transactions.
exports.transact = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const data = req.body;
    const { amount, fromType, fromId } = data;
    if (fromType !== 'USER')
        throw new api_1.APIError(400, "From type is only implemented for type 'user'.");
    if (fromId !== auth.uid)
        throw new api_1.APIError(403, 'Must be authenticated with userId equal to specified fromId.');
    if (isNaN(amount) || !isFinite(amount))
        throw new api_1.APIError(400, 'Invalid amount');
    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
        var _a;
        const result = await (0, run_txn_1.runTxn)(transaction, data);
        if (result.status == 'error') {
            throw new api_1.APIError(500, (_a = result.message) !== null && _a !== void 0 ? _a : 'An unknown error occurred.');
        }
        return result;
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=transact.js.map