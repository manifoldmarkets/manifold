"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectFrom = exports.selectJson = exports.run = exports.createClient = exports.getInstanceHostname = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
function getInstanceHostname(instanceId) {
    return `${instanceId}.supabase.co`;
}
exports.getInstanceHostname = getInstanceHostname;
function createClient(instanceId, key, opts) {
    const url = `https://${getInstanceHostname(instanceId)}`;
    return (0, supabase_js_1.createClient)(url, key, opts);
}
exports.createClient = createClient;
async function run(q) {
    const { data, count, error } = await q;
    if (error != null) {
        throw error;
    }
    else {
        return { data, count };
    }
}
exports.run = run;
function selectJson(db, table) {
    return db.from(table).select('data');
}
exports.selectJson = selectJson;
function selectFrom(db, table, ...fields) {
    const query = fields.map((f) => `data->${f}`).join(', ');
    const builder = db.from(table).select(query);
    return builder;
}
exports.selectFrom = selectFrom;
//# sourceMappingURL=utils.js.map