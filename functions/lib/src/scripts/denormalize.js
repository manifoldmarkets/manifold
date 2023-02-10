"use strict";
// Helper functions for maintaining the relationship between fields in one set of documents and denormalized copies in
// another set of documents.
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyDiff = exports.getDiffUpdate = exports.describeDiff = exports.findDiffs = void 0;
const lodash_1 = require("lodash");
function findDiffs(docs, ...paths) {
    const diffs = [];
    const srcPaths = paths.map((p) => p[0]);
    const destPaths = paths.map((p) => p[1]);
    for (const [srcDoc, destDocs] of docs) {
        const srcVals = srcPaths.map((p) => srcDoc.get(p));
        for (const destDoc of destDocs) {
            const destVals = destPaths.map((p) => destDoc.get(p));
            if (!(0, lodash_1.isEqual)(srcVals, destVals)) {
                diffs.push({
                    src: { doc: srcDoc, fields: srcPaths, vals: srcVals },
                    dest: { doc: destDoc, fields: destPaths, vals: destVals },
                });
            }
        }
    }
    return diffs;
}
exports.findDiffs = findDiffs;
function describeDiff(diff) {
    function describeDocVal(x) {
        return `${x.doc.ref.path}.[${x.fields.join('|')}]: [${x.vals.join('|')}]`;
    }
    return `${describeDocVal(diff.src)} -> ${describeDocVal(diff.dest)}`;
}
exports.describeDiff = describeDiff;
function getDiffUpdate(diff) {
    return {
        doc: diff.dest.doc.ref,
        fields: Object.fromEntries((0, lodash_1.zip)(diff.dest.fields, diff.src.vals)),
    };
}
exports.getDiffUpdate = getDiffUpdate;
function applyDiff(transaction, diff) {
    const update = getDiffUpdate(diff);
    transaction.update(update.doc, update.fields);
}
exports.applyDiff = applyDiff;
//# sourceMappingURL=denormalize.js.map