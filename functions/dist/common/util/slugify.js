"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = void 0;
const slugify = (text, separator = '-', maxLength = 35) => {
    return text
        .toString()
        .normalize('NFD') // split an accented letter in the base letter and the acent
        .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9 ]/g, '') // remove all chars not letters, numbers and spaces (to be replaced)
        .replace(/\s+/g, separator)
        .substring(0, maxLength)
        .replace(new RegExp(separator + '+$', 'g'), ''); // remove terminal separators
};
exports.slugify = slugify;
//# sourceMappingURL=slugify.js.map