"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const fs = require("fs");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const firestore = admin.firestore();
async function getJsonDump() {
    console.log('Downloading contracts');
    const contracts = await (0, utils_1.getValues)(firestore.collection('contracts'));
    console.log('Loaded contracts', contracts.length);
    fs.writeFileSync('contracts.json', JSON.stringify(contracts, null, 2));
    console.log('Downloading bets');
    const bets = await (0, utils_1.getValues)(firestore.collectionGroup('bets'));
    console.log('Loaded bets', bets.length);
    fs.writeFileSync('bets.json', JSON.stringify(bets, null, 2));
    console.log('Downloading comments');
    const comments = await (0, utils_1.getValues)(firestore.collectionGroup('comments'));
    console.log('Loaded comments', comments.length);
    fs.writeFileSync('comments.json', JSON.stringify(comments, null, 2));
}
if (require.main === module)
    getJsonDump().then(() => process.exit());
//# sourceMappingURL=get-json-dump.js.map