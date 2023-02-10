"use strict";
// At some point, someone deleted some contracts from the DB, but they
// didn't delete the group association, so now there are group associations
// for nonexisting contracts, mucking stuff up.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
if (require.main === module) {
    const groupContractsQuery = firestore.collectionGroup('groupContracts');
    groupContractsQuery.get().then(async (groupContractSnaps) => {
        (0, utils_1.log)(`Loaded ${groupContractSnaps.size} group contract associations.`);
        const contractIds = groupContractSnaps.docs.map((g) => g.data().contractId);
        const contractRefs = contractIds.map((c) => firestore.collection('contracts').doc(c));
        const contractDocs = (0, lodash_1.zip)(groupContractSnaps.docs, await firestore.getAll(...contractRefs));
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const needsFixing = contractDocs.filter(([_gc, c]) => !c.exists);
        (0, utils_1.log)(`${needsFixing.length} associations are for nonexistent contracts.`);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await Promise.all(needsFixing.map(([gc, _c]) => gc.ref.delete()));
        (0, utils_1.log)(`Deleted all invalid associations.`);
    });
}
//# sourceMappingURL=fix-null-group-contracts.js.map