"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.track = void 0;
const Amplitude = require("@amplitude/node");
const dev_1 = require("../../common/envs/dev");
const prod_1 = require("../../common/envs/prod");
const utils_1 = require("./utils");
const key = (0, utils_1.isProd)() ? prod_1.PROD_CONFIG.amplitudeApiKey : dev_1.DEV_CONFIG.amplitudeApiKey;
const amp = Amplitude.init(key !== null && key !== void 0 ? key : '');
const track = async (userId, eventName, eventProperties, amplitudeProperties) => {
    return await (0, utils_1.tryOrLogError)(amp.logEvent(Object.assign({ event_type: eventName, user_id: userId, event_properties: eventProperties }, amplitudeProperties)));
};
exports.track = track;
//# sourceMappingURL=analytics.js.map