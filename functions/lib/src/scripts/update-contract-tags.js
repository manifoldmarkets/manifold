"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const parse_1 = require("../../../common/util/parse");
const utils_1 = require("../utils");
async function updateContractTags() {
    var _a;
    const firestore = admin.firestore();
    console.log('Updating contracts tags');
    const contracts = await (0, utils_1.getValues)(firestore.collection('contracts'));
    console.log('Loaded', contracts.length, 'contracts');
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        const tags = (0, lodash_1.uniq)([
            ...(0, parse_1.parseTags)(contract.question + contract.description),
            ...((_a = contract.tags) !== null && _a !== void 0 ? _a : []),
        ]);
        const lowercaseTags = tags.map((tag) => tag.toLowerCase());
        console.log('Updating tags', contract.slug, 'from', contract.tags, 'to', tags);
        await contractRef.update({
            tags,
            lowercaseTags,
        });
    }
}
if (require.main === module) {
    updateContractTags().then(() => process.exit());
}
//# sourceMappingURL=update-contract-tags.js.map