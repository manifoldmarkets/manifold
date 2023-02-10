"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("../scripts/script-init");
(0, script_init_1.initAdmin)();
const time_1 = require("common/util/time");
const init_1 = require("functions/src/supabase/init");
const likes_1 = require("../supabase/likes");
const main = async () => {
    const db = (0, init_1.createSupabaseClient)();
    const now = Date.now();
    const weekAgo = now - 7 * time_1.DAY_MS;
    console.log(await (0, likes_1.getRecentContractLikes)(db, weekAgo));
    // const contractId = 'yzDIwPeY3ZaZZjmynbjP'
    // const response = await db
    //   .from('user_reactions')
    //   .select('*', { count: 'exact', head: true })
    //   .eq('data->>contentId', contractId)
    //   .gte('data->>createdTime', dayAgo)
    // const dayAgoLikes = await db.rpc('recently_liked_contract_counts' as any, { since: weekAgo })
};
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=test-supabase.js.map