"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTemplateEmail = exports.sendTextEmail = void 0;
const mailgun = require("mailgun-js");
const utils_1 = require("./utils");
const initMailgun = () => {
    const apiKey = process.env.MAILGUN_KEY;
    return mailgun({ apiKey, domain: 'mg.manifold.markets' });
};
const sendTextEmail = async (to, subject, text, options) => {
    var _a;
    const data = Object.assign(Object.assign({}, options), { from: (_a = options === null || options === void 0 ? void 0 : options.from) !== null && _a !== void 0 ? _a : 'Manifold Markets <info@manifold.markets>', to,
        subject,
        text, 
        // Don't rewrite urls in plaintext emails
        'o:tracking-clicks': 'htmlonly' });
    const mg = initMailgun().messages();
    const result = await (0, utils_1.tryOrLogError)(mg.send(data));
    if (result != null) {
        console.log('Sent text email', to, subject);
    }
    return result;
};
exports.sendTextEmail = sendTextEmail;
const sendTemplateEmail = async (to, subject, templateId, templateData, options) => {
    var _a;
    const data = Object.assign(Object.assign({}, options), { from: (_a = options === null || options === void 0 ? void 0 : options.from) !== null && _a !== void 0 ? _a : 'Manifold Markets <info@manifold.markets>', to,
        subject, template: templateId, 'h:X-Mailgun-Variables': JSON.stringify(templateData), 'o:tag': templateId, 'o:tracking': true });
    const mg = initMailgun().messages();
    const result = await (0, utils_1.tryOrLogError)(mg.send(data));
    if (result != null) {
        console.log('Sent template email', templateId, to, subject);
    }
    return result;
};
exports.sendTemplateEmail = sendTemplateEmail;
//# sourceMappingURL=send-email.js.map