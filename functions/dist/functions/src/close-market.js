"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closemarket = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const utils_1 = require("./utils");
const constants_1 = require("../../common/envs/constants");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    closeTime: zod_1.z.number().int().nonnegative().optional(),
});
exports.closemarket = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { contractId, closeTime } = (0, api_1.validate)(bodySchema, req.body);
    const contractDoc = firestore.doc(`contracts/${contractId}`);
    const contractSnap = await contractDoc.get();
    if (!contractSnap.exists)
        throw new api_1.APIError(404, 'No contract exists with the provided ID');
    const contract = contractSnap.data();
    const { creatorId } = contract;
    const firebaseUser = await admin.auth().getUser(auth.uid);
    if (creatorId !== auth.uid &&
        !(0, constants_1.isManifoldId)(auth.uid) &&
        !(0, constants_1.isAdmin)(firebaseUser.email))
        throw new api_1.APIError(403, 'User is not creator of contract');
    const now = Date.now();
    if (!closeTime && contract.closeTime && contract.closeTime < now)
        throw new api_1.APIError(400, 'Contract already closed');
    if (closeTime && closeTime < now)
        throw new api_1.APIError(400, 'Close time must be in the future. ' +
            'Alternatively, do not provide a close time to close immediately.');
    const creator = await (0, utils_1.getUser)(creatorId);
    if (!creator)
        throw new api_1.APIError(500, 'Creator not found');
    const updatedContract = Object.assign(Object.assign({}, contract), { closeTime: closeTime ? closeTime : now });
    await contractDoc.update(updatedContract);
    console.log('contract ', contractId, 'closed');
    return updatedContract;
});
const firestore = admin.firestore();
//# sourceMappingURL=close-market.js.map