"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newEndpointNoAuth = exports.newEndpoint = exports.validate = exports.zTimestamp = exports.writeResponseError = exports.lookupUser = exports.parseCredentials = exports.APIError = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const logger_1 = require("firebase-functions/logger");
const utils_1 = require("./utils");
const api_1 = require("../../common/api");
const constants_1 = require("../../common/envs/constants");
var api_2 = require("../../common/api");
Object.defineProperty(exports, "APIError", { enumerable: true, get: function () { return api_2.APIError; } });
const parseCredentials = async (req) => {
    const auth = admin.auth();
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        throw new api_1.APIError(403, 'Missing Authorization header.');
    }
    const authParts = authHeader.split(' ');
    if (authParts.length !== 2) {
        throw new api_1.APIError(403, 'Invalid Authorization header.');
    }
    const [scheme, payload] = authParts;
    switch (scheme) {
        case 'Bearer':
            try {
                return { kind: 'jwt', data: await auth.verifyIdToken(payload) };
            }
            catch (err) {
                // This is somewhat suspicious, so get it into the firebase console
                (0, logger_1.error)('Error verifying Firebase JWT: ', err);
                throw new api_1.APIError(403, 'Error validating token.');
            }
        case 'Key':
            return { kind: 'key', data: payload };
        default:
            throw new api_1.APIError(403, 'Invalid auth scheme; must be "Key" or "Bearer".');
    }
};
exports.parseCredentials = parseCredentials;
const lookupUser = async (creds) => {
    const firestore = admin.firestore();
    const privateUsers = firestore.collection('private-users');
    switch (creds.kind) {
        case 'jwt': {
            if (typeof creds.data.user_id !== 'string') {
                throw new api_1.APIError(403, 'JWT must contain Manifold user ID.');
            }
            return { uid: creds.data.user_id, creds };
        }
        case 'key': {
            const key = creds.data;
            const privateUserQ = await privateUsers.where('apiKey', '==', key).get();
            if (privateUserQ.empty) {
                throw new api_1.APIError(403, `No private user exists with API key ${key}.`);
            }
            const privateUser = privateUserQ.docs[0].data();
            return { uid: privateUser.id, creds: Object.assign({ privateUser }, creds) };
        }
        default:
            throw new api_1.APIError(500, 'Invalid credential type.');
    }
};
exports.lookupUser = lookupUser;
const writeResponseError = (e, res) => {
    if (e instanceof api_1.APIError) {
        const output = { message: e.message };
        if (e.details != null) {
            output.details = e.details;
        }
        res.status(e.code).json(output);
    }
    else {
        (0, logger_1.error)(e);
        res.status(500).json({ message: 'An unknown error occurred.' });
    }
};
exports.writeResponseError = writeResponseError;
const zTimestamp = () => {
    return zod_1.z.preprocess((arg) => {
        return typeof arg == 'number' ? new Date(arg) : undefined;
    }, zod_1.z.date());
};
exports.zTimestamp = zTimestamp;
const validate = (schema, val) => {
    const result = schema.safeParse(val);
    if (!result.success) {
        const issues = result.error.issues.map((i) => {
            // TODO: export this type for the front-end to parse
            return {
                field: i.path.join('.') || null,
                error: i.message,
            };
        });
        throw new api_1.APIError(400, 'Error validating request.', issues);
    }
    else {
        return result.data;
    }
};
exports.validate = validate;
const DEFAULT_OPTS = {
    method: 'POST',
    minInstances: 1,
    concurrency: 100,
    memory: '2GiB',
    cpu: 1,
    cors: [constants_1.CORS_ORIGIN_MANIFOLD, constants_1.CORS_ORIGIN_VERCEL, constants_1.CORS_ORIGIN_LOCALHOST],
    secrets: ['MAILGUN_KEY', 'SUPABASE_KEY', 'API_SECRET'],
};
const newEndpoint = (endpointOpts, fn) => {
    const opts = Object.assign({}, DEFAULT_OPTS, endpointOpts);
    return {
        opts,
        handler: async (req, res) => {
            (0, utils_1.log)(`${req.method} ${req.url} ${JSON.stringify(req.body)}`);
            try {
                if (opts.method !== req.method) {
                    throw new api_1.APIError(405, `This endpoint supports only ${opts.method}.`);
                }
                const authedUser = await (0, exports.lookupUser)(await (0, exports.parseCredentials)(req));
                res.status(200).json(await fn(req, authedUser));
            }
            catch (e) {
                (0, exports.writeResponseError)(e, res);
            }
        },
    };
};
exports.newEndpoint = newEndpoint;
const newEndpointNoAuth = (endpointOpts, fn) => {
    const opts = Object.assign({}, DEFAULT_OPTS, endpointOpts);
    return {
        opts,
        handler: async (req, res) => {
            (0, utils_1.log)(`${req.method} ${req.url} ${JSON.stringify(req.body)}`);
            try {
                if (opts.method !== req.method) {
                    throw new api_1.APIError(405, `This endpoint supports only ${opts.method}.`);
                }
                res.status(200).json(await fn(req));
            }
            catch (e) {
                (0, exports.writeResponseError)(e, res);
            }
        },
    };
};
exports.newEndpointNoAuth = newEndpointNoAuth;
//# sourceMappingURL=api.js.map