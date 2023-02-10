"use strict";
// Run with `npx ts-node src/scripts/contest/resolve-markets.ts`
Object.defineProperty(exports, "__esModule", { value: true });
const DOMAIN = 'dev.manifold.markets';
// Dev API key for Cause Exploration Prizes (@CEP)
const API_KEY = '188f014c-0ba2-4c35-9e6d-88252e281dbf';
const GROUP_SLUG = 'cart-contest';
// Can just curl /v0/group/{slug} to get a group
async function getGroupBySlug(slug) {
    const resp = await fetch(`https://${DOMAIN}/api/v0/group/${slug}`);
    return await resp.json();
}
async function getMarketsByGroupId(id) {
    // API structure: /v0/group/by-id/[id]/markets
    const resp = await fetch(`https://${DOMAIN}/api/v0/group/by-id/${id}/markets`);
    return await resp.json();
}
/* Example curl request:
# Resolve a binary market
$ curl https://manifold.markets/api/v0/market/{marketId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "YES"}'
*/
async function resolveMarketById(id, outcome) {
    const resp = await fetch(`https://${DOMAIN}/api/v0/market/${id}/resolve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${API_KEY}`,
        },
        body: JSON.stringify({
            outcome,
        }),
    });
    return await resp.json();
}
async function main() {
    const group = await getGroupBySlug(GROUP_SLUG);
    const markets = await getMarketsByGroupId(group.id);
    // Count up some metrics
    console.log('Number of markets', markets.length);
    console.log('Number of resolved markets', markets.filter((m) => m.isResolved).length);
    // Resolve each market to NO
    for (const market of markets) {
        if (!market.isResolved) {
            console.log(`Resolving market ${market.url} to NO`);
            await resolveMarketById(market.id, 'NO');
        }
    }
}
main();
//# sourceMappingURL=bulk-resolve-markets.js.map