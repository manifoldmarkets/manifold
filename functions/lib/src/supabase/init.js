"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseDirectClient = exports.createSupabaseClient = exports.pgp = void 0;
const pgPromise = require("pg-promise");
const utils_1 = require("../../../common/supabase/utils");
const dev_1 = require("../../../common/envs/dev");
const prod_1 = require("../../../common/envs/prod");
const utils_2 = require("../utils");
exports.pgp = pgPromise();
function createSupabaseClient() {
    var _a;
    const instanceId = (_a = process.env.SUPABASE_INSTANCE_ID) !== null && _a !== void 0 ? _a : ((0, utils_2.isProd)() ? prod_1.PROD_CONFIG.supabaseInstanceId : dev_1.DEV_CONFIG.supabaseInstanceId);
    if (!instanceId) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config.");
    }
    const key = process.env.SUPABASE_KEY;
    if (!key) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.");
    }
    return (0, utils_1.createClient)(instanceId, key);
}
exports.createSupabaseClient = createSupabaseClient;
function createSupabaseDirectClient() {
    var _a;
    const instanceId = (_a = process.env.SUPABASE_INSTANCE_ID) !== null && _a !== void 0 ? _a : ((0, utils_2.isProd)() ? prod_1.PROD_CONFIG.supabaseInstanceId : dev_1.DEV_CONFIG.supabaseInstanceId);
    if (!instanceId) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config.");
    }
    const password = process.env.SUPABASE_PASSWORD;
    if (!password) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_PASSWORD.");
    }
    return (0, exports.pgp)({
        host: `db.${(0, utils_1.getInstanceHostname)(instanceId)}`,
        port: 5432,
        user: 'postgres',
        password: password,
    });
}
exports.createSupabaseDirectClient = createSupabaseDirectClient;
//# sourceMappingURL=init.js.map