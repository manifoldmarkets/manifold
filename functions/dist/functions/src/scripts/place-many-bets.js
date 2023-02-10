"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("functions/src/scripts/script-init");
const node_fetch_1 = require("node-fetch");
async function placeManyBets(apiKey, count) {
    const url = 'https://placebet-w3txbmd3ba-uc.a.run.app';
    const betData = {
        contractId: 'pdcWgwpzV4RsJjQGVq9v',
        amount: 10,
        outcome: 'NO',
    };
    let success = 0;
    let failure = 0;
    const promises = [];
    const start = Date.now();
    console.log(`Placing ${count} bets  at ${url} on contract ${betData.contractId}.`);
    const errorMessage = {};
    for (let i = 0; i < count; i++) {
        const resp = (0, node_fetch_1.default)(url, {
            method: 'POST',
            headers: {
                Authorization: `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(betData),
        })
            .then(async (resp) => {
            const json = await resp.json();
            if (resp.status === 200) {
                success++;
            }
            else {
                errorMessage[json.message] = errorMessage[json.message]
                    ? errorMessage[json.message] + 1
                    : 1;
                failure++;
            }
        })
            .catch(() => {
            failure++;
        });
        promises.push(resp);
    }
    await Promise.all(promises);
    const end = Date.now();
    Object.entries(errorMessage).map(([key, value]) => {
        console.log(`Error seen: ${key} (${value} times)`);
    });
    console.log(`Tried placing ${count} bets: Success: ${success}, Failure: ${failure} in ${end - start}ms`);
}
if (require.main === module) {
    (0, script_init_1.initAdmin)();
    const args = process.argv.slice(2);
    if (args.length != 2) {
        console.log('Usage: place-many-bets [apikey] [number-of-bets-to-place]');
    }
    else {
        placeManyBets(args[0], parseInt(args[1])).catch((e) => console.error(e));
    }
}
//# sourceMappingURL=place-many-bets.js.map