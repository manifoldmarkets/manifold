"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const lodash_1 = require("lodash");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
const getBettorsByContractId = async () => {
    const bets = await (0, utils_1.getValues)(firestore.collectionGroup('bets'));
    (0, utils_1.log)(`Loaded ${bets.length} bets.`);
    const betsByContractId = (0, lodash_1.groupBy)(bets, 'contractId');
    return (0, lodash_1.mapValues)(betsByContractId, (bets) => (0, lodash_1.uniq)((0, lodash_1.sortBy)(bets, 'createdTime').map((bet) => bet.userId)));
};
const updateUniqueBettors = async () => {
    const bettorsByContractId = await getBettorsByContractId();
    const updates = Object.entries(bettorsByContractId).map(([contractId, userIds]) => {
        const update = {
            uniqueBettorIds: userIds,
            uniqueBettorCount: userIds.length,
        };
        const docRef = firestore.collection('contracts').doc(contractId);
        return { doc: docRef, fields: update };
    });
    (0, utils_1.log)(`Updating ${updates.length} contracts.`);
    await (0, utils_1.writeAsync)(firestore, updates);
    (0, utils_1.log)(`Updated all contracts.`);
};
if (require.main === module) {
    updateUniqueBettors();
}
//# sourceMappingURL=backfill-unique-bettors.js.map