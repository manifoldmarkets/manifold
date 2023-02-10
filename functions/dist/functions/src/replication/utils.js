"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.createSupabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dev_1 = require("../../../common/envs/dev");
const prod_1 = require("../../../common/envs/prod");
const utils_1 = require("../utils");
function createSupabaseClient(opts) {
    var _a;
    const url = (_a = process.env.SUPABASE_URL) !== null && _a !== void 0 ? _a : ((0, utils_1.isProd)() ? prod_1.PROD_CONFIG.supabaseUrl : dev_1.DEV_CONFIG.supabaseUrl);
    if (!url) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_URL and no supabaseUrl in config.");
    }
    const key = process.env.SUPABASE_KEY;
    if (!key) {
        throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.");
    }
    return (0, supabase_js_1.createClient)(url, key, opts);
}
exports.createSupabaseClient = createSupabaseClient;
async function run(q) {
    const response = await q;
    if (response.error != null) {
        throw response.error;
    }
    else {
        return { data: response.data, count: response.count };
    }
}
exports.run = run;
//# sourceMappingURL=utils.js.map