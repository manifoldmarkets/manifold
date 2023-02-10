"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCsv = exports.writeCsv = exports.readJson = exports.writeJson = void 0;
const promises_1 = require("fs/promises");
const writeJson = async (filename, obj) => {
    console.log('\n', 'Writing to', filename, '\n');
    await (0, promises_1.writeFile)(filename, JSON.stringify(obj));
};
exports.writeJson = writeJson;
const readJson = async (filename) => {
    let data;
    try {
        data = await (0, promises_1.readFile)(filename, { encoding: 'utf-8' });
    }
    catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
            // File doesn't exist.
            return undefined;
        }
        else {
            throw e;
        }
    }
    return JSON.parse(data);
};
exports.readJson = readJson;
const SEPARATOR = ',';
const writeCsv = async (filename, fields, data) => {
    console.log('\n', 'Writing to', filename, '\n');
    const firstLine = fields.join(SEPARATOR) + '\n';
    const lines = firstLine +
        data
            .map((datum) => {
            const values = fields.map((field) => { var _a; return (_a = datum[field]) !== null && _a !== void 0 ? _a : ''; });
            return values.join(SEPARATOR);
        })
            .join('\n') +
        '\n';
    await (0, promises_1.writeFile)(filename, lines);
};
exports.writeCsv = writeCsv;
const readCsv = async (filename) => {
    let data;
    try {
        data = await (0, promises_1.readFile)(filename, { encoding: 'utf-8' });
    }
    catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
            // File doesn't exist.
            return undefined;
        }
        else {
            throw e;
        }
    }
    const lines = data.split('\n');
    const fields = lines[0].split(SEPARATOR);
    const rows = [];
    for (const line of lines.slice(1)) {
        const items = line.split(SEPARATOR);
        const row = {};
        for (let i = 0; i < items.length; i++)
            row[fields[i]] = items[i];
        rows.push(row);
    }
    return rows;
};
exports.readCsv = readCsv;
//# sourceMappingURL=file.js.map