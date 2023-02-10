"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanDisplayName = exports.cleanUsername = void 0;
const cleanUsername = (name, maxLength = 25) => {
    return name
        .replace(/\s+/g, '')
        .normalize('NFD') // split an accented letter in the base letter and the acent
        .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
        .replace(/[^A-Za-z0-9_]/g, '') // remove all chars not letters, numbers and underscores
        .substring(0, maxLength);
};
exports.cleanUsername = cleanUsername;
const cleanDisplayName = (displayName, maxLength = 30) => {
    return displayName.replace(/\s+/g, ' ').substring(0, maxLength).trim();
};
exports.cleanDisplayName = cleanDisplayName;
//# sourceMappingURL=clean-username.js.map