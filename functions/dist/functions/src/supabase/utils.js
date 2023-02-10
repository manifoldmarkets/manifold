"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkInsert = void 0;
const init_1 = require("./init");
async function bulkInsert(db, table, values) {
    if (values.length) {
        const columnNames = Object.keys(values[0]);
        const cs = new init_1.pgp.helpers.ColumnSet(columnNames, { table });
        const query = init_1.pgp.helpers.insert(values, cs);
        await db.none(query);
    }
}
exports.bulkInsert = bulkInsert;
//# sourceMappingURL=utils.js.map