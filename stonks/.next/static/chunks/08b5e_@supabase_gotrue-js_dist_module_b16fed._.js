(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["static/chunks/08b5e_@supabase_gotrue-js_dist_module_b16fed._.js", {

"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "Deferred": (()=>Deferred),
    "decodeBase64URL": (()=>decodeBase64URL),
    "decodeJWTPayload": (()=>decodeJWTPayload),
    "expiresAt": (()=>expiresAt),
    "generatePKCEChallenge": (()=>generatePKCEChallenge),
    "generatePKCEVerifier": (()=>generatePKCEVerifier),
    "getItemAsync": (()=>getItemAsync),
    "isBrowser": (()=>isBrowser),
    "looksLikeFetchResponse": (()=>looksLikeFetchResponse),
    "parseParametersFromURL": (()=>parseParametersFromURL),
    "removeItemAsync": (()=>removeItemAsync),
    "resolveFetch": (()=>resolveFetch),
    "retryable": (()=>retryable),
    "setItemAsync": (()=>setItemAsync),
    "sleep": (()=>sleep),
    "supportsLocalStorage": (()=>supportsLocalStorage),
    "uuid": (()=>uuid)
});
function expiresAt(expiresIn) {
    const timeNow = Math.round(Date.now() / 1000);
    return timeNow + expiresIn;
}
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : r & 0x3 | 0x8;
        return v.toString(16);
    });
}
const isBrowser = ()=>typeof document !== 'undefined';
const localStorageWriteTests = {
    tested: false,
    writable: false
};
const supportsLocalStorage = ()=>{
    if (!isBrowser()) {
        return false;
    }
    try {
        if (typeof globalThis.localStorage !== 'object') {
            return false;
        }
    } catch (e) {
        // DOM exception when accessing `localStorage`
        return false;
    }
    if (localStorageWriteTests.tested) {
        return localStorageWriteTests.writable;
    }
    const randomKey = `lswt-${Math.random()}${Math.random()}`;
    try {
        globalThis.localStorage.setItem(randomKey, randomKey);
        globalThis.localStorage.removeItem(randomKey);
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = true;
    } catch (e) {
        // localStorage can't be written to
        // https://www.chromium.org/for-testers/bug-reporting-guidelines/uncaught-securityerror-failed-to-read-the-localstorage-property-from-window-access-is-denied-for-this-document
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = false;
    }
    return localStorageWriteTests.writable;
};
function parseParametersFromURL(href) {
    const result = {};
    const url = new URL(href);
    if (url.hash && url.hash[0] === '#') {
        try {
            const hashSearchParams = new URLSearchParams(url.hash.substring(1));
            hashSearchParams.forEach((value, key)=>{
                result[key] = value;
            });
        } catch (e) {
        // hash is not a query string
        }
    }
    // search parameters take precedence over hash parameters
    url.searchParams.forEach((value, key)=>{
        result[key] = value;
    });
    return result;
}
const resolveFetch = (customFetch)=>{
    let _fetch;
    if (customFetch) {
        _fetch = customFetch;
    } else if (typeof fetch === 'undefined') {
        _fetch = (...args)=>__turbopack_require__("[project]/node_modules/@supabase/node-fetch/browser.js [client] (ecmascript, async loader)")(__turbopack_import__).then(({ default: fetch1 })=>fetch1(...args));
    } else {
        _fetch = fetch;
    }
    return (...args)=>_fetch(...args);
};
const looksLikeFetchResponse = (maybeResponse)=>{
    return typeof maybeResponse === 'object' && maybeResponse !== null && 'status' in maybeResponse && 'ok' in maybeResponse && 'json' in maybeResponse && typeof maybeResponse.json === 'function';
};
const setItemAsync = async (storage, key, data)=>{
    await storage.setItem(key, JSON.stringify(data));
};
const getItemAsync = async (storage, key)=>{
    const value = await storage.getItem(key);
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (_a) {
        return value;
    }
};
const removeItemAsync = async (storage, key)=>{
    await storage.removeItem(key);
};
function decodeBase64URL(value) {
    const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let base64 = '';
    let chr1, chr2, chr3;
    let enc1, enc2, enc3, enc4;
    let i = 0;
    value = value.replace('-', '+').replace('_', '/');
    while(i < value.length){
        enc1 = key.indexOf(value.charAt(i++));
        enc2 = key.indexOf(value.charAt(i++));
        enc3 = key.indexOf(value.charAt(i++));
        enc4 = key.indexOf(value.charAt(i++));
        chr1 = enc1 << 2 | enc2 >> 4;
        chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        chr3 = (enc3 & 3) << 6 | enc4;
        base64 = base64 + String.fromCharCode(chr1);
        if (enc3 != 64 && chr2 != 0) {
            base64 = base64 + String.fromCharCode(chr2);
        }
        if (enc4 != 64 && chr3 != 0) {
            base64 = base64 + String.fromCharCode(chr3);
        }
    }
    return base64;
}
class Deferred {
    constructor(){
        // eslint-disable-next-line @typescript-eslint/no-extra-semi
        ;
        this.promise = new Deferred.promiseConstructor((res, rej)=>{
            // eslint-disable-next-line @typescript-eslint/no-extra-semi
            ;
            this.resolve = res;
            this.reject = rej;
        });
    }
}
Deferred.promiseConstructor = Promise;
function decodeJWTPayload(token) {
    // Regex checks for base64url format
    const base64UrlRegex = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}=?$|[a-z0-9_-]{2}(==)?$)$/i;
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('JWT is not valid: not a JWT structure');
    }
    if (!base64UrlRegex.test(parts[1])) {
        throw new Error('JWT is not valid: payload is not in base64url format');
    }
    const base64Url = parts[1];
    return JSON.parse(decodeBase64URL(base64Url));
}
async function sleep(time) {
    return await new Promise((accept)=>{
        setTimeout(()=>accept(null), time);
    });
}
function retryable(fn, isRetryable) {
    const promise = new Promise((accept, reject)=>{
        // eslint-disable-next-line @typescript-eslint/no-extra-semi
        ;
        (async ()=>{
            for(let attempt = 0; attempt < Infinity; attempt++){
                try {
                    const result = await fn(attempt);
                    if (!isRetryable(attempt, null, result)) {
                        accept(result);
                        return;
                    }
                } catch (e) {
                    if (!isRetryable(attempt, e)) {
                        reject(e);
                        return;
                    }
                }
            }
        })();
    });
    return promise;
}
function dec2hex(dec) {
    return ('0' + dec.toString(16)).substr(-2);
}
function generatePKCEVerifier() {
    const verifierLength = 56;
    const array = new Uint32Array(verifierLength);
    if (typeof crypto === 'undefined') {
        const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const charSetLen = charSet.length;
        let verifier = '';
        for(let i = 0; i < verifierLength; i++){
            verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
        }
        return verifier;
    }
    crypto.getRandomValues(array);
    return Array.from(array, dec2hex).join('');
}
async function sha256(randomString) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(randomString);
    const hash = await crypto.subtle.digest('SHA-256', encodedData);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map((c)=>String.fromCharCode(c)).join('');
}
function base64urlencode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function generatePKCEChallenge(verifier) {
    const hasCryptoSupport = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' && typeof TextEncoder !== 'undefined';
    if (!hasCryptoSupport) {
        console.warn('WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.');
        return verifier;
    }
    const hashed = await sha256(verifier);
    return base64urlencode(hashed);
} //# sourceMappingURL=helpers.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/errors.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "AuthApiError": (()=>AuthApiError),
    "AuthError": (()=>AuthError),
    "AuthImplicitGrantRedirectError": (()=>AuthImplicitGrantRedirectError),
    "AuthInvalidCredentialsError": (()=>AuthInvalidCredentialsError),
    "AuthInvalidTokenResponseError": (()=>AuthInvalidTokenResponseError),
    "AuthPKCEGrantCodeExchangeError": (()=>AuthPKCEGrantCodeExchangeError),
    "AuthRetryableFetchError": (()=>AuthRetryableFetchError),
    "AuthSessionMissingError": (()=>AuthSessionMissingError),
    "AuthUnknownError": (()=>AuthUnknownError),
    "CustomAuthError": (()=>CustomAuthError),
    "isAuthApiError": (()=>isAuthApiError),
    "isAuthError": (()=>isAuthError),
    "isAuthRetryableFetchError": (()=>isAuthRetryableFetchError)
});
class AuthError extends Error {
    constructor(message, status){
        super(message);
        this.__isAuthError = true;
        this.name = 'AuthError';
        this.status = status;
    }
}
function isAuthError(error) {
    return typeof error === 'object' && error !== null && '__isAuthError' in error;
}
class AuthApiError extends AuthError {
    constructor(message, status){
        super(message, status);
        this.name = 'AuthApiError';
        this.status = status;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status
        };
    }
}
function isAuthApiError(error) {
    return isAuthError(error) && error.name === 'AuthApiError';
}
class AuthUnknownError extends AuthError {
    constructor(message, originalError){
        super(message);
        this.name = 'AuthUnknownError';
        this.originalError = originalError;
    }
}
class CustomAuthError extends AuthError {
    constructor(message, name, status){
        super(message);
        this.name = name;
        this.status = status;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status
        };
    }
}
class AuthSessionMissingError extends CustomAuthError {
    constructor(){
        super('Auth session missing!', 'AuthSessionMissingError', 400);
    }
}
class AuthInvalidTokenResponseError extends CustomAuthError {
    constructor(){
        super('Auth session or user missing', 'AuthInvalidTokenResponseError', 500);
    }
}
class AuthInvalidCredentialsError extends CustomAuthError {
    constructor(message){
        super(message, 'AuthInvalidCredentialsError', 400);
    }
}
class AuthImplicitGrantRedirectError extends CustomAuthError {
    constructor(message, details = null){
        super(message, 'AuthImplicitGrantRedirectError', 500);
        this.details = null;
        this.details = details;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            details: this.details
        };
    }
}
class AuthPKCEGrantCodeExchangeError extends CustomAuthError {
    constructor(message, details = null){
        super(message, 'AuthPKCEGrantCodeExchangeError', 500);
        this.details = null;
        this.details = details;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            details: this.details
        };
    }
}
class AuthRetryableFetchError extends CustomAuthError {
    constructor(message, status){
        super(message, 'AuthRetryableFetchError', status);
    }
}
function isAuthRetryableFetchError(error) {
    return isAuthError(error) && error.name === 'AuthRetryableFetchError';
} //# sourceMappingURL=errors.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/fetch.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "_generateLinkResponse": (()=>_generateLinkResponse),
    "_noResolveJsonResponse": (()=>_noResolveJsonResponse),
    "_request": (()=>_request),
    "_sessionResponse": (()=>_sessionResponse),
    "_ssoResponse": (()=>_ssoResponse),
    "_userResponse": (()=>_userResponse)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/errors.js [client] (ecmascript)");
var __rest = this && this.__rest || function(s, e) {
    var t = {};
    for(var p in s)if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function") for(var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++){
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
    }
    return t;
};
;
;
const _getErrorMessage = (err)=>err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
const NETWORK_ERROR_CODES = [
    502,
    503,
    504
];
async function handleError(error) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["looksLikeFetchResponse"])(error)) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthRetryableFetchError"](_getErrorMessage(error), 0);
    }
    if (NETWORK_ERROR_CODES.includes(error.status)) {
        // status in 500...599 range - server had an error, request might be retryed.
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthRetryableFetchError"](_getErrorMessage(error), error.status);
    }
    let data;
    try {
        data = await error.json();
    } catch (e) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthUnknownError"](_getErrorMessage(e), e);
    }
    throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthApiError"](_getErrorMessage(data), error.status || 500);
}
const _getRequestParams = (method, options, parameters, body)=>{
    const params = {
        method,
        headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
    };
    if (method === 'GET') {
        return params;
    }
    params.headers = Object.assign({
        'Content-Type': 'application/json;charset=UTF-8'
    }, options === null || options === void 0 ? void 0 : options.headers);
    params.body = JSON.stringify(body);
    return Object.assign(Object.assign({}, params), parameters);
};
async function _request(fetcher, method, url, options) {
    var _a;
    const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
    if (options === null || options === void 0 ? void 0 : options.jwt) {
        headers['Authorization'] = `Bearer ${options.jwt}`;
    }
    const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
    if (options === null || options === void 0 ? void 0 : options.redirectTo) {
        qs['redirect_to'] = options.redirectTo;
    }
    const queryString = Object.keys(qs).length ? '?' + new URLSearchParams(qs).toString() : '';
    const data = await _handleRequest(fetcher, method, url + queryString, {
        headers,
        noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
    }, {}, options === null || options === void 0 ? void 0 : options.body);
    return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : {
        data: Object.assign({}, data),
        error: null
    };
}
async function _handleRequest(fetcher, method, url, options, parameters, body) {
    const requestParams = _getRequestParams(method, options, parameters, body);
    let result;
    try {
        result = await fetcher(url, requestParams);
    } catch (e) {
        console.error(e);
        // fetch failed, likely due to a network or CORS error
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthRetryableFetchError"](_getErrorMessage(e), 0);
    }
    if (!result.ok) {
        await handleError(result);
    }
    if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
        return result;
    }
    try {
        return await result.json();
    } catch (e) {
        await handleError(e);
    }
}
function _sessionResponse(data) {
    var _a;
    let session = null;
    if (hasSession(data)) {
        session = Object.assign({}, data);
        if (!data.expires_at) {
            session.expires_at = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["expiresAt"])(data.expires_in);
        }
    }
    const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
    return {
        data: {
            session,
            user
        },
        error: null
    };
}
function _userResponse(data) {
    var _a;
    const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
    return {
        data: {
            user
        },
        error: null
    };
}
function _ssoResponse(data) {
    return {
        data,
        error: null
    };
}
function _generateLinkResponse(data) {
    const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = __rest(data, [
        "action_link",
        "email_otp",
        "hashed_token",
        "redirect_to",
        "verification_type"
    ]);
    const properties = {
        action_link,
        email_otp,
        hashed_token,
        redirect_to,
        verification_type
    };
    const user = Object.assign({}, rest);
    return {
        data: {
            properties,
            user
        },
        error: null
    };
}
function _noResolveJsonResponse(data) {
    return data;
}
/**
 * hasSession checks if the response object contains a valid session
 * @param data A response object
 * @returns true if a session is in the response
 */ function hasSession(data) {
    return data.access_token && data.refresh_token && data.expires_in;
} //# sourceMappingURL=fetch.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueAdminApi.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "default": (()=>GoTrueAdminApi)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/fetch.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/errors.js [client] (ecmascript)");
var __rest = this && this.__rest || function(s, e) {
    var t = {};
    for(var p in s)if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function") for(var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++){
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
    }
    return t;
};
;
;
;
class GoTrueAdminApi {
    constructor({ url = '', headers = {}, fetch }){
        this.url = url;
        this.headers = headers;
        this.fetch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["resolveFetch"])(fetch);
        this.mfa = {
            listFactors: this._listFactors.bind(this),
            deleteFactor: this._deleteFactor.bind(this)
        };
    }
    /**
     * Removes a logged-in session.
     * @param jwt A valid, logged-in JWT.
     * @param scope The logout sope.
     */ async signOut(jwt, scope = 'global') {
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/logout?scope=${scope}`, {
                headers: this.headers,
                jwt,
                noResolveJson: true
            });
            return {
                data: null,
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Sends an invite link to an email address.
     * @param email The email address of the user.
     * @param options Additional options to be included when inviting.
     */ async inviteUserByEmail(email, options = {}) {
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/invite`, {
                body: {
                    email,
                    data: options.data
                },
                headers: this.headers,
                redirectTo: options.redirectTo,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Generates email links and OTPs to be sent via a custom email provider.
     * @param email The user's email.
     * @param options.password User password. For signup only.
     * @param options.data Optional user metadata. For signup only.
     * @param options.redirectTo The redirect url which should be appended to the generated link
     */ async generateLink(params) {
        try {
            const { options } = params, rest = __rest(params, [
                "options"
            ]);
            const body = Object.assign(Object.assign({}, rest), options);
            if ('newEmail' in rest) {
                // replace newEmail with new_email in request body
                body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
                delete body['newEmail'];
            }
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/admin/generate_link`, {
                body: body,
                headers: this.headers,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_generateLinkResponse"],
                redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        properties: null,
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    // User Admin API
    /**
     * Creates a new user.
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */ async createUser(attributes) {
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/admin/users`, {
                body: attributes,
                headers: this.headers,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Get a list of users.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
     */ async listUsers(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const pagination = {
                nextPage: null,
                lastPage: 0,
                total: 0
            };
            const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/admin/users`, {
                headers: this.headers,
                noResolveJson: true,
                query: {
                    page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : '',
                    per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ''
                },
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_noResolveJsonResponse"]
            });
            if (response.error) throw response.error;
            const users = await response.json();
            const total = (_e = response.headers.get('x-total-count')) !== null && _e !== void 0 ? _e : 0;
            const links = (_g = (_f = response.headers.get('link')) === null || _f === void 0 ? void 0 : _f.split(',')) !== null && _g !== void 0 ? _g : [];
            if (links.length > 0) {
                links.forEach((link)=>{
                    const page = parseInt(link.split(';')[0].split('=')[1].substring(0, 1));
                    const rel = JSON.parse(link.split(';')[1].split('=')[1]);
                    pagination[`${rel}Page`] = page;
                });
                pagination.total = parseInt(total);
            }
            return {
                data: Object.assign(Object.assign({}, users), pagination),
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        users: []
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Get user by id.
     *
     * @param uid The user's unique identifier
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */ async getUserById(uid) {
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/admin/users/${uid}`, {
                headers: this.headers,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Updates the user data.
     *
     * @param attributes The data you want to update.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */ async updateUserById(uid, attributes) {
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'PUT', `${this.url}/admin/users/${uid}`, {
                body: attributes,
                headers: this.headers,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Delete a user. Requires a `service_role` key.
     *
     * @param id The user id you want to remove.
     * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema.
     * Defaults to false for backward compatibility.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */ async deleteUser(id, shouldSoftDelete = false) {
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'DELETE', `${this.url}/admin/users/${id}`, {
                headers: this.headers,
                body: {
                    should_soft_delete: shouldSoftDelete
                },
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    async _listFactors(params) {
        try {
            const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/admin/users/${params.userId}/factors`, {
                headers: this.headers,
                xform: (factors)=>{
                    return {
                        data: {
                            factors
                        },
                        error: null
                    };
                }
            });
            return {
                data,
                error
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    async _deleteFactor(params) {
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'DELETE', `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
                headers: this.headers
            });
            return {
                data,
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
} //# sourceMappingURL=GoTrueAdminApi.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/version.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
// Generated by genversion.
__turbopack_esm__({
    "version": (()=>version)
});
const version = '2.57.0'; //# sourceMappingURL=version.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/constants.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "AUDIENCE": (()=>AUDIENCE),
    "DEFAULT_HEADERS": (()=>DEFAULT_HEADERS),
    "EXPIRY_MARGIN": (()=>EXPIRY_MARGIN),
    "GOTRUE_URL": (()=>GOTRUE_URL),
    "NETWORK_FAILURE": (()=>NETWORK_FAILURE),
    "STORAGE_KEY": (()=>STORAGE_KEY)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$version$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/version.js [client] (ecmascript)");
;
const GOTRUE_URL = 'http://localhost:9999';
const STORAGE_KEY = 'supabase.auth.token';
const AUDIENCE = '';
const DEFAULT_HEADERS = {
    'X-Client-Info': `gotrue-js/${__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$version$2e$js__$5b$client$5d$__$28$ecmascript$29$__["version"]}`
};
const EXPIRY_MARGIN = 10; // in seconds
const NETWORK_FAILURE = {
    MAX_RETRIES: 10,
    RETRY_INTERVAL: 2
}; //# sourceMappingURL=constants.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/local-storage.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "localStorageAdapter": (()=>localStorageAdapter),
    "memoryLocalStorageAdapter": (()=>memoryLocalStorageAdapter)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)");
;
const localStorageAdapter = {
    getItem: (key)=>{
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["supportsLocalStorage"])()) {
            return null;
        }
        return globalThis.localStorage.getItem(key);
    },
    setItem: (key, value)=>{
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["supportsLocalStorage"])()) {
            return;
        }
        globalThis.localStorage.setItem(key, value);
    },
    removeItem: (key)=>{
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["supportsLocalStorage"])()) {
            return;
        }
        globalThis.localStorage.removeItem(key);
    }
};
function memoryLocalStorageAdapter(store = {}) {
    return {
        getItem: (key)=>{
            return store[key] || null;
        },
        setItem: (key, value)=>{
            store[key] = value;
        },
        removeItem: (key)=>{
            delete store[key];
        }
    };
} //# sourceMappingURL=local-storage.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/polyfills.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
/**
 * https://mathiasbynens.be/notes/globalthis
 */ __turbopack_esm__({
    "polyfillGlobalThis": (()=>polyfillGlobalThis)
});
function polyfillGlobalThis() {
    if (typeof globalThis === 'object') return;
    try {
        Object.defineProperty(Object.prototype, '__magic__', {
            get: function() {
                return this;
            },
            configurable: true
        });
        // @ts-expect-error 'Allow access to magic'
        __magic__.globalThis = __magic__;
        // @ts-expect-error 'Allow access to magic'
        delete Object.prototype.__magic__;
    } catch (e) {
        if (typeof self !== 'undefined') {
            // @ts-expect-error 'Allow access to globals'
            self.globalThis = self;
        }
    }
} //# sourceMappingURL=polyfills.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/locks.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "LockAcquireTimeoutError": (()=>LockAcquireTimeoutError),
    "NavigatorLockAcquireTimeoutError": (()=>NavigatorLockAcquireTimeoutError),
    "internals": (()=>internals),
    "navigatorLock": (()=>navigatorLock)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)");
;
const internals = {
    /**
     * @experimental
     */ debug: !!(globalThis && (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["supportsLocalStorage"])() && globalThis.localStorage && globalThis.localStorage.getItem('supabase.gotrue-js.locks.debug') === 'true')
};
class LockAcquireTimeoutError extends Error {
    constructor(message){
        super(message);
        this.isAcquireTimeout = true;
    }
}
class NavigatorLockAcquireTimeoutError extends LockAcquireTimeoutError {
}
async function navigatorLock(name, acquireTimeout, fn) {
    if (internals.debug) {
        console.log('@supabase/gotrue-js: navigatorLock: acquire lock', name, acquireTimeout);
    }
    const abortController = new globalThis.AbortController();
    if (acquireTimeout > 0) {
        setTimeout(()=>{
            abortController.abort();
            if (internals.debug) {
                console.log('@supabase/gotrue-js: navigatorLock acquire timed out', name);
            }
        }, acquireTimeout);
    }
    // MDN article: https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request
    return await globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
        mode: 'exclusive',
        ifAvailable: true
    } : {
        mode: 'exclusive',
        signal: abortController.signal
    }, async (lock)=>{
        if (lock) {
            if (internals.debug) {
                console.log('@supabase/gotrue-js: navigatorLock: acquired', name, lock.name);
            }
            try {
                return await fn();
            } finally{
                if (internals.debug) {
                    console.log('@supabase/gotrue-js: navigatorLock: released', name, lock.name);
                }
            }
        } else {
            if (acquireTimeout === 0) {
                if (internals.debug) {
                    console.log('@supabase/gotrue-js: navigatorLock: not immediately available', name);
                }
                throw new NavigatorLockAcquireTimeoutError(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
            } else {
                if (internals.debug) {
                    try {
                        const result = await globalThis.navigator.locks.query();
                        console.log('@supabase/gotrue-js: Navigator LockManager state', JSON.stringify(result, null, '  '));
                    } catch (e) {
                        console.warn('@supabase/gotrue-js: Error when querying Navigator LockManager state', e);
                    }
                }
                // Browser is not following the Navigator LockManager spec, it
                // returned a null lock when we didn't use ifAvailable. So we can
                // pretend the lock is acquired in the name of backward compatibility
                // and user experience and just run the function.
                console.warn('@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request');
                return await fn();
            }
        }
    });
} //# sourceMappingURL=locks.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueClient.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({
    "default": (()=>GoTrueClient)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueAdminApi$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueAdminApi.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/constants.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/errors.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/fetch.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/helpers.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$local$2d$storage$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/local-storage.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$polyfills$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/polyfills.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$version$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/version.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$locks$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/locks.js [client] (ecmascript)");
;
;
;
;
;
;
;
;
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$polyfills$2e$js__$5b$client$5d$__$28$ecmascript$29$__["polyfillGlobalThis"])(); // Make "globalThis" available
const DEFAULT_OPTIONS = {
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__["GOTRUE_URL"],
    storageKey: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__["STORAGE_KEY"],
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    headers: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__["DEFAULT_HEADERS"],
    flowType: 'implicit',
    debug: false
};
/** Current session will be checked for refresh at this interval. */ const AUTO_REFRESH_TICK_DURATION = 30 * 1000;
/**
 * A token refresh will be attempted this many ticks before the current session expires. */ const AUTO_REFRESH_TICK_THRESHOLD = 3;
async function lockNoOp(name, acquireTimeout, fn) {
    return await fn();
}
class GoTrueClient {
    /**
     * Create a new client for use in the browser.
     */ constructor(options){
        var _a;
        this.memoryStorage = null;
        this.stateChangeEmitters = new Map();
        this.autoRefreshTicker = null;
        this.visibilityChangedCallback = null;
        this.refreshingDeferred = null;
        /**
         * Keeps track of the async client initialization.
         * When null or not yet resolved the auth state is `unknown`
         * Once resolved the the auth state is known and it's save to call any further client methods.
         * Keep extra care to never reject or throw uncaught errors
         */ this.initializePromise = null;
        this.detectSessionInUrl = true;
        this.lockAcquired = false;
        this.pendingInLock = [];
        /**
         * Used to broadcast state change events to other tabs listening.
         */ this.broadcastChannel = null;
        this.logger = console.log;
        this.instanceID = GoTrueClient.nextInstanceID;
        GoTrueClient.nextInstanceID += 1;
        if (this.instanceID > 0 && (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])()) {
            console.warn('Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.');
        }
        const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        this.logDebugMessages = !!settings.debug;
        if (typeof settings.debug === 'function') {
            this.logger = settings.debug;
        }
        this.persistSession = settings.persistSession;
        this.storageKey = settings.storageKey;
        this.autoRefreshToken = settings.autoRefreshToken;
        this.admin = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueAdminApi$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"]({
            url: settings.url,
            headers: settings.headers,
            fetch: settings.fetch
        });
        this.url = settings.url;
        this.headers = settings.headers;
        this.fetch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["resolveFetch"])(settings.fetch);
        this.lock = settings.lock || lockNoOp;
        this.detectSessionInUrl = settings.detectSessionInUrl;
        this.flowType = settings.flowType;
        this.mfa = {
            verify: this._verify.bind(this),
            enroll: this._enroll.bind(this),
            unenroll: this._unenroll.bind(this),
            challenge: this._challenge.bind(this),
            listFactors: this._listFactors.bind(this),
            challengeAndVerify: this._challengeAndVerify.bind(this),
            getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this)
        };
        if (this.persistSession) {
            if (settings.storage) {
                this.storage = settings.storage;
            } else {
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["supportsLocalStorage"])()) {
                    this.storage = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$local$2d$storage$2e$js__$5b$client$5d$__$28$ecmascript$29$__["localStorageAdapter"];
                } else {
                    this.memoryStorage = {};
                    this.storage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$local$2d$storage$2e$js__$5b$client$5d$__$28$ecmascript$29$__["memoryLocalStorageAdapter"])(this.memoryStorage);
                }
            }
        } else {
            this.memoryStorage = {};
            this.storage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$local$2d$storage$2e$js__$5b$client$5d$__$28$ecmascript$29$__["memoryLocalStorageAdapter"])(this.memoryStorage);
        }
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
            try {
                this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
            } catch (e) {
                console.error('Failed to create a new BroadcastChannel, multi-tab state changes will not be available', e);
            }
            (_a = this.broadcastChannel) === null || _a === void 0 ? void 0 : _a.addEventListener('message', async (event)=>{
                this._debug('received broadcast notification from other tab or client', event);
                await this._notifyAllSubscribers(event.data.event, event.data.session, false); // broadcast = false so we don't get an endless loop of messages
            });
        }
        this.initialize();
    }
    _debug(...args) {
        if (this.logDebugMessages) {
            this.logger(`GoTrueClient@${this.instanceID} (${__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$version$2e$js__$5b$client$5d$__$28$ecmascript$29$__["version"]}) ${new Date().toISOString()}`, ...args);
        }
        return this;
    }
    /**
     * Initializes the client session either from the url or from storage.
     * This method is automatically called when instantiating the client, but should also be called
     * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
     */ async initialize() {
        if (this.initializePromise) {
            return await this.initializePromise;
        }
        this.initializePromise = (async ()=>{
            return await this._acquireLock(-1, async ()=>{
                return await this._initialize();
            });
        })();
        return await this.initializePromise;
    }
    /**
     * IMPORTANT:
     * 1. Never throw in this method, as it is called from the constructor
     * 2. Never return a session from this method as it would be cached over
     *    the whole lifetime of the client
     */ async _initialize() {
        try {
            const isPKCEFlow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() ? await this._isPKCEFlow() : false;
            this._debug('#_initialize()', 'begin', 'is PKCE flow', isPKCEFlow);
            if (isPKCEFlow || this.detectSessionInUrl && this._isImplicitGrantFlow()) {
                const { data, error } = await this._getSessionFromURL(isPKCEFlow);
                if (error) {
                    this._debug('#_initialize()', 'error detecting session from URL', error);
                    // failed login attempt via url,
                    // remove old session as in verifyOtp, signUp and signInWith*
                    await this._removeSession();
                    return {
                        error
                    };
                }
                const { session, redirectType } = data;
                this._debug('#_initialize()', 'detected session in URL', session, 'redirect type', redirectType);
                await this._saveSession(session);
                setTimeout(async ()=>{
                    if (redirectType === 'recovery') {
                        await this._notifyAllSubscribers('PASSWORD_RECOVERY', session);
                    } else {
                        await this._notifyAllSubscribers('SIGNED_IN', session);
                    }
                }, 0);
                return {
                    error: null
                };
            }
            // no login attempt via callback url try to recover session from storage
            await this._recoverAndRefresh();
            return {
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    error
                };
            }
            return {
                error: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthUnknownError"]('Unexpected error during initialization', error)
            };
        } finally{
            await this._handleVisibilityChange();
            this._debug('#_initialize()', 'end');
        }
    }
    /**
     * Creates a new user.
     *
     * Be aware that if a user account exists in the system you may get back an
     * error message that attempts to hide this information from the user.
     * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
     *
     * @returns A logged-in session if the server has "autoconfirm" ON
     * @returns A user if the server has "autoconfirm" OFF
     */ async signUp(credentials) {
        var _a, _b, _c;
        try {
            await this._removeSession();
            let res;
            if ('email' in credentials) {
                const { email, password, options } = credentials;
                let codeChallenge = null;
                let codeChallengeMethod = null;
                if (this.flowType === 'pkce') {
                    const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
                    codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
                    codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
                }
                res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/signup`, {
                    headers: this.headers,
                    redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
                    body: {
                        email,
                        password,
                        data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        },
                        code_challenge: codeChallenge,
                        code_challenge_method: codeChallengeMethod
                    },
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
                });
            } else if ('phone' in credentials) {
                const { phone, password, options } = credentials;
                res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/signup`, {
                    headers: this.headers,
                    body: {
                        phone,
                        password,
                        data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
                        channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : 'sms',
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        }
                    },
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
                });
            } else {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidCredentialsError"]('You must provide either an email or phone number and a password');
            }
            const { data, error } = res;
            if (error || !data) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error: error
                };
            }
            const session = data.session;
            const user = data.user;
            if (data.session) {
                await this._saveSession(data.session);
                await this._notifyAllSubscribers('SIGNED_IN', session);
            }
            return {
                data: {
                    user,
                    session
                },
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Log in an existing user with an email and password or phone and password.
     *
     * Be aware that you may get back an error message that will not distinguish
     * between the cases where the account does not exist or that the
     * email/phone and password combination is wrong or that the account can only
     * be accessed via social login.
     */ async signInWithPassword(credentials) {
        try {
            await this._removeSession();
            let res;
            if ('email' in credentials) {
                const { email, password, options } = credentials;
                res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/token?grant_type=password`, {
                    headers: this.headers,
                    body: {
                        email,
                        password,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        }
                    },
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
                });
            } else if ('phone' in credentials) {
                const { phone, password, options } = credentials;
                res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/token?grant_type=password`, {
                    headers: this.headers,
                    body: {
                        phone,
                        password,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        }
                    },
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
                });
            } else {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidCredentialsError"]('You must provide either an email or phone number and a password');
            }
            const { data, error } = res;
            if (error) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            } else if (!data || !data.session || !data.user) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidTokenResponseError"]()
                };
            }
            if (data.session) {
                await this._saveSession(data.session);
                await this._notifyAllSubscribers('SIGNED_IN', data.session);
            }
            return {
                data: {
                    user: data.user,
                    session: data.session
                },
                error
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Log in an existing user via a third-party provider.
     * This method supports the PKCE flow.
     */ async signInWithOAuth(credentials) {
        var _a, _b, _c, _d;
        await this._removeSession();
        return await this._handleProviderSignIn(credentials.provider, {
            redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
            scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
            queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
            skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
        });
    }
    /**
     * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
     */ async exchangeCodeForSession(authCode) {
        await this.initializePromise;
        return this._acquireLock(-1, async ()=>{
            return this._exchangeCodeForSession(authCode);
        });
    }
    async _exchangeCodeForSession(authCode) {
        const codeVerifier = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["getItemAsync"])(this.storage, `${this.storageKey}-code-verifier`);
        const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/token?grant_type=pkce`, {
            headers: this.headers,
            body: {
                auth_code: authCode,
                code_verifier: codeVerifier
            },
            xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
        });
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["removeItemAsync"])(this.storage, `${this.storageKey}-code-verifier`);
        if (error) {
            return {
                data: {
                    user: null,
                    session: null
                },
                error
            };
        } else if (!data || !data.session || !data.user) {
            return {
                data: {
                    user: null,
                    session: null
                },
                error: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidTokenResponseError"]()
            };
        }
        if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers('SIGNED_IN', data.session);
        }
        return {
            data,
            error
        };
    }
    /**
     * Allows signing in with an OIDC ID token. The authentication provider used
     * should be enabled and configured.
     */ async signInWithIdToken(credentials) {
        await this._removeSession();
        try {
            const { options, provider, token, access_token, nonce } = credentials;
            const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/token?grant_type=id_token`, {
                headers: this.headers,
                body: {
                    provider,
                    id_token: token,
                    access_token,
                    nonce,
                    gotrue_meta_security: {
                        captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                    }
                },
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
            });
            const { data, error } = res;
            if (error) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            } else if (!data || !data.session || !data.user) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidTokenResponseError"]()
                };
            }
            if (data.session) {
                await this._saveSession(data.session);
                await this._notifyAllSubscribers('SIGNED_IN', data.session);
            }
            return {
                data,
                error
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Log in a user using magiclink or a one-time password (OTP).
     *
     * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
     * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
     * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
     *
     * Be aware that you may get back an error message that will not distinguish
     * between the cases where the account does not exist or, that the account
     * can only be accessed via social login.
     *
     * Do note that you will need to configure a Whatsapp sender on Twilio
     * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
     * channel is not supported on other providers
     * at this time.
     * This method supports PKCE when an email is passed.
     */ async signInWithOtp(credentials) {
        var _a, _b, _c, _d, _e;
        try {
            await this._removeSession();
            if ('email' in credentials) {
                const { email, options } = credentials;
                let codeChallenge = null;
                let codeChallengeMethod = null;
                if (this.flowType === 'pkce') {
                    const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
                    codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
                    codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
                }
                const { error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/otp`, {
                    headers: this.headers,
                    body: {
                        email,
                        data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                        create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        },
                        code_challenge: codeChallenge,
                        code_challenge_method: codeChallengeMethod
                    },
                    redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
                });
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            if ('phone' in credentials) {
                const { phone, options } = credentials;
                const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/otp`, {
                    headers: this.headers,
                    body: {
                        phone,
                        data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
                        create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        },
                        channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : 'sms'
                    }
                });
                return {
                    data: {
                        user: null,
                        session: null,
                        messageId: data === null || data === void 0 ? void 0 : data.message_id
                    },
                    error
                };
            }
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidCredentialsError"]('You must provide either an email or phone number.');
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
     */ async verifyOtp(params) {
        var _a, _b;
        try {
            if (params.type !== 'email_change' && params.type !== 'phone_change') {
                // we don't want to remove the authenticated session if the user is performing an email_change or phone_change verification
                await this._removeSession();
            }
            let redirectTo = undefined;
            let captchaToken = undefined;
            if ('options' in params) {
                redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
                captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
            }
            const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/verify`, {
                headers: this.headers,
                body: Object.assign(Object.assign({}, params), {
                    gotrue_meta_security: {
                        captcha_token: captchaToken
                    }
                }),
                redirectTo,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
            });
            if (error) {
                throw error;
            }
            if (!data) {
                throw new Error('An error occurred on token verification.');
            }
            const session = data.session;
            const user = data.user;
            if (session === null || session === void 0 ? void 0 : session.access_token) {
                await this._saveSession(session);
                await this._notifyAllSubscribers('SIGNED_IN', session);
            }
            return {
                data: {
                    user,
                    session
                },
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Attempts a single-sign on using an enterprise Identity Provider. A
     * successful SSO attempt will redirect the current page to the identity
     * provider authorization page. The redirect URL is implementation and SSO
     * protocol specific.
     *
     * You can use it by providing a SSO domain. Typically you can extract this
     * domain by asking users for their email address. If this domain is
     * registered on the Auth instance the redirect will use that organization's
     * currently active SSO Identity Provider for the login.
     *
     * If you have built an organization-specific login page, you can use the
     * organization's SSO Identity Provider UUID directly instead.
     */ async signInWithSSO(params) {
        var _a, _b, _c;
        try {
            await this._removeSession();
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === 'pkce') {
                const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
                codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
                codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
            }
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/sso`, {
                body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, 'providerId' in params ? {
                    provider_id: params.providerId
                } : null), 'domain' in params ? {
                    domain: params.domain
                } : null), {
                    redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : undefined
                }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? {
                    gotrue_meta_security: {
                        captcha_token: params.options.captchaToken
                    }
                } : null), {
                    skip_http_redirect: true,
                    code_challenge: codeChallenge,
                    code_challenge_method: codeChallengeMethod
                }),
                headers: this.headers,
                xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_ssoResponse"]
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Sends a reauthentication OTP to the user's email or phone number.
     * Requires the user to be signed-in.
     */ async reauthenticate() {
        await this.initializePromise;
        return await this._acquireLock(-1, async ()=>{
            return await this._reauthenticate();
        });
    }
    async _reauthenticate() {
        try {
            return await this._useSession(async (result)=>{
                const { data: { session }, error: sessionError } = result;
                if (sessionError) throw sessionError;
                if (!session) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
                const { error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/reauthenticate`, {
                    headers: this.headers,
                    jwt: session.access_token
                });
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
     */ async resend(credentials) {
        try {
            if (credentials.type != 'email_change' && credentials.type != 'phone_change') {
                await this._removeSession();
            }
            const endpoint = `${this.url}/resend`;
            if ('email' in credentials) {
                const { email, type, options } = credentials;
                const { error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', endpoint, {
                    headers: this.headers,
                    body: {
                        email,
                        type,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        }
                    },
                    redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
                });
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            } else if ('phone' in credentials) {
                const { phone, type, options } = credentials;
                const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', endpoint, {
                    headers: this.headers,
                    body: {
                        phone,
                        type,
                        gotrue_meta_security: {
                            captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken
                        }
                    }
                });
                return {
                    data: {
                        user: null,
                        session: null,
                        messageId: data === null || data === void 0 ? void 0 : data.message_id
                    },
                    error
                };
            }
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthInvalidCredentialsError"]('You must provide either an email or phone number and a type');
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Returns the session, refreshing it if necessary.
     * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
     */ async getSession() {
        await this.initializePromise;
        return this._acquireLock(-1, async ()=>{
            return this._useSession(async (result)=>{
                return result;
            });
        });
    }
    /**
     * Acquires a global lock based on the storage key.
     */ async _acquireLock(acquireTimeout, fn) {
        this._debug('#_acquireLock', 'begin', acquireTimeout);
        try {
            if (this.lockAcquired) {
                const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
                const result = (async ()=>{
                    await last;
                    return await fn();
                })();
                this.pendingInLock.push((async ()=>{
                    try {
                        await result;
                    } catch (e) {
                    // we just care if it finished
                    }
                })());
                return result;
            }
            return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async ()=>{
                this._debug('#_acquireLock', 'lock acquired for storage key', this.storageKey);
                try {
                    this.lockAcquired = true;
                    const result = fn();
                    this.pendingInLock.push((async ()=>{
                        try {
                            await result;
                        } catch (e) {
                        // we just care if it finished
                        }
                    })());
                    await result;
                    // keep draining the queue until there's nothing to wait on
                    while(this.pendingInLock.length){
                        const waitOn = [
                            ...this.pendingInLock
                        ];
                        await Promise.all(waitOn);
                        this.pendingInLock.splice(0, waitOn.length);
                    }
                    return await result;
                } finally{
                    this._debug('#_acquireLock', 'lock released for storage key', this.storageKey);
                    this.lockAcquired = false;
                }
            });
        } finally{
            this._debug('#_acquireLock', 'end');
        }
    }
    /**
     * Use instead of {@link #getSession} inside the library. It is
     * semantically usually what you want, as getting a session involves some
     * processing afterwards that requires only one client operating on the
     * session at once across multiple tabs or processes.
     */ async _useSession(fn) {
        this._debug('#_useSession', 'begin');
        try {
            // the use of __loadSession here is the only correct use of the function!
            const result = await this.__loadSession();
            return await fn(result);
        } finally{
            this._debug('#_useSession', 'end');
        }
    }
    /**
     * NEVER USE DIRECTLY!
     *
     * Always use {@link #_useSession}.
     */ async __loadSession() {
        this._debug('#__loadSession()', 'begin');
        if (!this.lockAcquired) {
            this._debug('#__loadSession()', 'used outside of an acquired lock!', new Error().stack);
        }
        try {
            let currentSession = null;
            const maybeSession = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["getItemAsync"])(this.storage, this.storageKey);
            this._debug('#getSession()', 'session from storage', maybeSession);
            if (maybeSession !== null) {
                if (this._isValidSession(maybeSession)) {
                    currentSession = maybeSession;
                } else {
                    this._debug('#getSession()', 'session from storage is not valid');
                    await this._removeSession();
                }
            }
            if (!currentSession) {
                return {
                    data: {
                        session: null
                    },
                    error: null
                };
            }
            const hasExpired = currentSession.expires_at ? currentSession.expires_at <= Date.now() / 1000 : false;
            this._debug('#__loadSession()', `session has${hasExpired ? '' : ' not'} expired`, 'expires_at', currentSession.expires_at);
            if (!hasExpired) {
                return {
                    data: {
                        session: currentSession
                    },
                    error: null
                };
            }
            const { session, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
                return {
                    data: {
                        session: null
                    },
                    error
                };
            }
            return {
                data: {
                    session
                },
                error: null
            };
        } finally{
            this._debug('#__loadSession()', 'end');
        }
    }
    /**
     * Gets the current user details if there is an existing session.
     * @param jwt Takes in an optional access token jwt. If no jwt is provided, getUser() will attempt to get the jwt from the current session.
     */ async getUser(jwt) {
        if (jwt) {
            return await this._getUser(jwt);
        }
        await this.initializePromise;
        return this._acquireLock(-1, async ()=>{
            return await this._getUser();
        });
    }
    async _getUser(jwt) {
        try {
            if (jwt) {
                return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/user`, {
                    headers: this.headers,
                    jwt: jwt,
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
                });
            }
            return await this._useSession(async (result)=>{
                var _a, _b;
                const { data, error } = result;
                if (error) {
                    throw error;
                }
                return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'GET', `${this.url}/user`, {
                    headers: this.headers,
                    jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : undefined,
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
                });
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Updates user data for a logged in user.
     */ async updateUser(attributes, options = {}) {
        await this.initializePromise;
        return await this._acquireLock(-1, async ()=>{
            return await this._updateUser(attributes, options);
        });
    }
    async _updateUser(attributes, options = {}) {
        try {
            return await this._useSession(async (result)=>{
                const { data: sessionData, error: sessionError } = result;
                if (sessionError) {
                    throw sessionError;
                }
                if (!sessionData.session) {
                    throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
                }
                const session = sessionData.session;
                let codeChallenge = null;
                let codeChallengeMethod = null;
                if (this.flowType === 'pkce' && attributes.email != null) {
                    const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
                    codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
                    codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
                }
                const { data, error: userError } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'PUT', `${this.url}/user`, {
                    headers: this.headers,
                    redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
                    body: Object.assign(Object.assign({}, attributes), {
                        code_challenge: codeChallenge,
                        code_challenge_method: codeChallengeMethod
                    }),
                    jwt: session.access_token,
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_userResponse"]
                });
                if (userError) throw userError;
                session.user = data.user;
                await this._saveSession(session);
                await this._notifyAllSubscribers('USER_UPDATED', session);
                return {
                    data: {
                        user: session.user
                    },
                    error: null
                };
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Decodes a JWT (without performing any validation).
     */ _decodeJWT(jwt) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["decodeJWTPayload"])(jwt);
    }
    /**
     * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
     * If the refresh token or access token in the current session is invalid, an error will be thrown.
     * @param currentSession The current session that minimally contains an access token and refresh token.
     */ async setSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(-1, async ()=>{
            return await this._setSession(currentSession);
        });
    }
    async _setSession(currentSession) {
        try {
            if (!currentSession.access_token || !currentSession.refresh_token) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
            }
            const timeNow = Date.now() / 1000;
            let expiresAt = timeNow;
            let hasExpired = true;
            let session = null;
            const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["decodeJWTPayload"])(currentSession.access_token);
            if (payload.exp) {
                expiresAt = payload.exp;
                hasExpired = expiresAt <= timeNow;
            }
            if (hasExpired) {
                const { session: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
                if (error) {
                    return {
                        data: {
                            user: null,
                            session: null
                        },
                        error: error
                    };
                }
                if (!refreshedSession) {
                    return {
                        data: {
                            user: null,
                            session: null
                        },
                        error: null
                    };
                }
                session = refreshedSession;
            } else {
                const { data, error } = await this._getUser(currentSession.access_token);
                if (error) {
                    throw error;
                }
                session = {
                    access_token: currentSession.access_token,
                    refresh_token: currentSession.refresh_token,
                    user: data.user,
                    token_type: 'bearer',
                    expires_in: expiresAt - timeNow,
                    expires_at: expiresAt
                };
                await this._saveSession(session);
                await this._notifyAllSubscribers('SIGNED_IN', session);
            }
            return {
                data: {
                    user: session.user,
                    session
                },
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        session: null,
                        user: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Returns a new session, regardless of expiry status.
     * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
     * If the current session's refresh token is invalid, an error will be thrown.
     * @param currentSession The current session. If passed in, it must contain a refresh token.
     */ async refreshSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(-1, async ()=>{
            return await this._refreshSession(currentSession);
        });
    }
    async _refreshSession(currentSession) {
        try {
            return await this._useSession(async (result)=>{
                var _a;
                if (!currentSession) {
                    const { data, error } = result;
                    if (error) {
                        throw error;
                    }
                    currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : undefined;
                }
                if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
                    throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
                }
                const { session, error } = await this._callRefreshToken(currentSession.refresh_token);
                if (error) {
                    return {
                        data: {
                            user: null,
                            session: null
                        },
                        error: error
                    };
                }
                if (!session) {
                    return {
                        data: {
                            user: null,
                            session: null
                        },
                        error: null
                    };
                }
                return {
                    data: {
                        user: session.user,
                        session
                    },
                    error: null
                };
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        user: null,
                        session: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Gets the session data from a URL string
     */ async _getSessionFromURL(isPKCEFlow) {
        try {
            if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])()) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthImplicitGrantRedirectError"]('No browser detected.');
            if (this.flowType === 'implicit' && !this._isImplicitGrantFlow()) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthImplicitGrantRedirectError"]('Not a valid implicit grant flow url.');
            } else if (this.flowType == 'pkce' && !isPKCEFlow) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthPKCEGrantCodeExchangeError"]('Not a valid PKCE flow url.');
            }
            const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["parseParametersFromURL"])(window.location.href);
            if (isPKCEFlow) {
                if (!params.code) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthPKCEGrantCodeExchangeError"]('No code detected.');
                const { data, error } = await this._exchangeCodeForSession(params.code);
                if (error) throw error;
                const url = new URL(window.location.href);
                url.searchParams.delete('code');
                window.history.replaceState(window.history.state, '', url.toString());
                return {
                    data: {
                        session: data.session,
                        redirectType: null
                    },
                    error: null
                };
            }
            if (params.error || params.error_description || params.error_code) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthImplicitGrantRedirectError"](params.error_description || 'Error in URL with unspecified error_description', {
                    error: params.error || 'unspecified_error',
                    code: params.error_code || 'unspecified_code'
                });
            }
            const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
            if (!access_token || !expires_in || !refresh_token || !token_type) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthImplicitGrantRedirectError"]('No session defined in URL');
            }
            const timeNow = Math.round(Date.now() / 1000);
            const expiresIn = parseInt(expires_in);
            let expiresAt = timeNow + expiresIn;
            if (expires_at) {
                expiresAt = parseInt(expires_at);
            }
            const actuallyExpiresIn = expiresAt - timeNow;
            if (actuallyExpiresIn * 1000 <= AUTO_REFRESH_TICK_DURATION) {
                console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
            }
            const issuedAt = expiresAt - expiresIn;
            if (timeNow - issuedAt >= 120) {
                console.warn('@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale', issuedAt, expiresAt, timeNow);
            } else if (timeNow - issuedAt < 0) {
                console.warn('@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clok for skew', issuedAt, expiresAt, timeNow);
            }
            const { data, error } = await this._getUser(access_token);
            if (error) throw error;
            const session = {
                provider_token,
                provider_refresh_token,
                access_token,
                expires_in: expiresIn,
                expires_at: expiresAt,
                refresh_token,
                token_type,
                user: data.user
            };
            // Remove tokens from URL
            window.location.hash = '';
            this._debug('#_getSessionFromURL()', 'clearing window.location.hash');
            return {
                data: {
                    session,
                    redirectType: params.type
                },
                error: null
            };
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        session: null,
                        redirectType: null
                    },
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
     */ _isImplicitGrantFlow() {
        const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["parseParametersFromURL"])(window.location.href);
        return !!((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() && (params.access_token || params.error_description));
    }
    /**
     * Checks if the current URL and backing storage contain parameters given by a PKCE flow
     */ async _isPKCEFlow() {
        const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["parseParametersFromURL"])(window.location.href);
        const currentStorageContent = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["getItemAsync"])(this.storage, `${this.storageKey}-code-verifier`);
        return !!(params.code && currentStorageContent);
    }
    /**
     * Inside a browser context, `signOut()` will remove the logged in user from the browser session
     * and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
     *
     * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
     * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
     *
     * If using others scope, no `SIGNED_OUT` event is fired!
     */ async signOut(options = {
        scope: 'global'
    }) {
        await this.initializePromise;
        return await this._acquireLock(-1, async ()=>{
            return await this._signOut(options);
        });
    }
    async _signOut({ scope } = {
        scope: 'global'
    }) {
        return await this._useSession(async (result)=>{
            var _a;
            const { data, error: sessionError } = result;
            if (sessionError) {
                return {
                    error: sessionError
                };
            }
            const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
            if (accessToken) {
                const { error } = await this.admin.signOut(accessToken, scope);
                if (error) {
                    // ignore 404s since user might not exist anymore
                    // ignore 401s since an invalid or expired JWT should sign out the current session
                    if (!((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthApiError"])(error) && (error.status === 404 || error.status === 401))) {
                        return {
                            error
                        };
                    }
                }
            }
            if (scope !== 'others') {
                await this._removeSession();
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["removeItemAsync"])(this.storage, `${this.storageKey}-code-verifier`);
                await this._notifyAllSubscribers('SIGNED_OUT', null);
            }
            return {
                error: null
            };
        });
    }
    /**
     * Receive a notification every time an auth event happens.
     * @param callback A callback function to be invoked when an auth event happens.
     */ onAuthStateChange(callback) {
        const id = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["uuid"])();
        const subscription = {
            id,
            callback,
            unsubscribe: ()=>{
                this._debug('#unsubscribe()', 'state change callback with id removed', id);
                this.stateChangeEmitters.delete(id);
            }
        };
        this._debug('#onAuthStateChange()', 'registered callback with id', id);
        this.stateChangeEmitters.set(id, subscription);
        (async ()=>{
            await this.initializePromise;
            await this._acquireLock(-1, async ()=>{
                this._emitInitialSession(id);
            });
        })();
        return {
            data: {
                subscription
            }
        };
    }
    async _emitInitialSession(id) {
        return await this._useSession(async (result)=>{
            var _a, _b;
            try {
                const { data: { session }, error } = result;
                if (error) throw error;
                await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback('INITIAL_SESSION', session));
                this._debug('INITIAL_SESSION', 'callback id', id, 'session', session);
            } catch (err) {
                await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback('INITIAL_SESSION', null));
                this._debug('INITIAL_SESSION', 'callback id', id, 'error', err);
                console.error(err);
            }
        });
    }
    /**
     * Sends a password reset request to an email address.
     * This method supports the PKCE flow.
     * @param email The email address of the user.
     * @param options.redirectTo The URL to send the user to after they click the password reset link.
     * @param options.captchaToken Verification token received when the user completes the captcha on the site.
     */ async resetPasswordForEmail(email, options = {}) {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === 'pkce') {
            const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
            codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
            codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
        }
        try {
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/recover`, {
                body: {
                    email,
                    code_challenge: codeChallenge,
                    code_challenge_method: codeChallengeMethod,
                    gotrue_meta_security: {
                        captcha_token: options.captchaToken
                    }
                },
                headers: this.headers,
                redirectTo: options.redirectTo
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    /**
     * Generates a new JWT.
     * @param refreshToken A valid refresh token that was returned on login.
     */ async _refreshAccessToken(refreshToken) {
        const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, 'begin');
        try {
            const startedAt = Date.now();
            // will attempt to refresh the token with exponential backoff
            return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["retryable"])(async (attempt)=>{
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["sleep"])(attempt * 200); // 0, 200, 400, 800, ...
                this._debug(debugName, 'refreshing attempt', attempt);
                return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/token?grant_type=refresh_token`, {
                    body: {
                        refresh_token: refreshToken
                    },
                    headers: this.headers,
                    xform: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_sessionResponse"]
                });
            }, (attempt, _, result)=>result && result.error && (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthRetryableFetchError"])(result.error) && // retryable only if the request can be sent before the backoff overflows the tick duration
                Date.now() + (attempt + 1) * 200 - startedAt < AUTO_REFRESH_TICK_DURATION);
        } catch (error) {
            this._debug(debugName, 'error', error);
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: {
                        session: null,
                        user: null
                    },
                    error
                };
            }
            throw error;
        } finally{
            this._debug(debugName, 'end');
        }
    }
    _isValidSession(maybeSession) {
        const isValidSession = typeof maybeSession === 'object' && maybeSession !== null && 'access_token' in maybeSession && 'refresh_token' in maybeSession && 'expires_at' in maybeSession;
        return isValidSession;
    }
    async _handleProviderSignIn(provider, options) {
        const url = await this._getUrlForProvider(provider, {
            redirectTo: options.redirectTo,
            scopes: options.scopes,
            queryParams: options.queryParams
        });
        this._debug('#_handleProviderSignIn()', 'provider', provider, 'options', options, 'url', url);
        // try to open on the browser
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() && !options.skipBrowserRedirect) {
            window.location.assign(url);
        }
        return {
            data: {
                provider,
                url
            },
            error: null
        };
    }
    /**
     * Recovers the session from LocalStorage and refreshes
     * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
     */ async _recoverAndRefresh() {
        var _a;
        const debugName = '#_recoverAndRefresh()';
        this._debug(debugName, 'begin');
        try {
            const currentSession = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["getItemAsync"])(this.storage, this.storageKey);
            this._debug(debugName, 'session from storage', currentSession);
            if (!this._isValidSession(currentSession)) {
                this._debug(debugName, 'session is not valid');
                if (currentSession !== null) {
                    await this._removeSession();
                }
                return;
            }
            const timeNow = Math.round(Date.now() / 1000);
            const expiresWithMargin = ((_a = currentSession.expires_at) !== null && _a !== void 0 ? _a : Infinity) < timeNow + __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__["EXPIRY_MARGIN"];
            this._debug(debugName, `session has${expiresWithMargin ? '' : ' not'} expired with margin of ${__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$constants$2e$js__$5b$client$5d$__$28$ecmascript$29$__["EXPIRY_MARGIN"]}s`);
            if (expiresWithMargin) {
                if (this.autoRefreshToken && currentSession.refresh_token) {
                    const { error } = await this._callRefreshToken(currentSession.refresh_token);
                    if (error) {
                        console.error(error);
                        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthRetryableFetchError"])(error)) {
                            this._debug(debugName, 'refresh failed with a non-retryable error, removing the session', error);
                            await this._removeSession();
                        }
                    }
                }
            } else {
                // no need to persist currentSession again, as we just loaded it from
                // local storage; persisting it again may overwrite a value saved by
                // another client with access to the same local storage
                await this._notifyAllSubscribers('SIGNED_IN', currentSession);
            }
        } catch (err) {
            this._debug(debugName, 'error', err);
            console.error(err);
            return;
        } finally{
            this._debug(debugName, 'end');
        }
    }
    async _callRefreshToken(refreshToken) {
        var _a, _b;
        if (!refreshToken) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
        }
        // refreshing is already in progress
        if (this.refreshingDeferred) {
            return this.refreshingDeferred.promise;
        }
        const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, 'begin');
        try {
            this.refreshingDeferred = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["Deferred"]();
            const { data, error } = await this._refreshAccessToken(refreshToken);
            if (error) throw error;
            if (!data.session) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["AuthSessionMissingError"]();
            await this._saveSession(data.session);
            await this._notifyAllSubscribers('TOKEN_REFRESHED', data.session);
            const result = {
                session: data.session,
                error: null
            };
            this.refreshingDeferred.resolve(result);
            return result;
        } catch (error) {
            this._debug(debugName, 'error', error);
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                const result = {
                    session: null,
                    error
                };
                (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
                return result;
            }
            (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
            throw error;
        } finally{
            this.refreshingDeferred = null;
            this._debug(debugName, 'end');
        }
    }
    async _notifyAllSubscribers(event, session, broadcast = true) {
        const debugName = `#_notifyAllSubscribers(${event})`;
        this._debug(debugName, 'begin', session, `broadcast = ${broadcast}`);
        try {
            if (this.broadcastChannel && broadcast) {
                this.broadcastChannel.postMessage({
                    event,
                    session
                });
            }
            const errors = [];
            const promises = Array.from(this.stateChangeEmitters.values()).map(async (x)=>{
                try {
                    await x.callback(event, session);
                } catch (e) {
                    errors.push(e);
                }
            });
            await Promise.all(promises);
            if (errors.length > 0) {
                for(let i = 0; i < errors.length; i += 1){
                    console.error(errors[i]);
                }
                throw errors[0];
            }
        } finally{
            this._debug(debugName, 'end');
        }
    }
    /**
     * set currentSession and currentUser
     * process to _startAutoRefreshToken if possible
     */ async _saveSession(session) {
        this._debug('#_saveSession()', session);
        await this._persistSession(session);
    }
    _persistSession(currentSession) {
        this._debug('#_persistSession()', currentSession);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, this.storageKey, currentSession);
    }
    async _removeSession() {
        this._debug('#_removeSession()');
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["removeItemAsync"])(this.storage, this.storageKey);
    }
    /**
     * Removes any registered visibilitychange callback.
     *
     * {@see #startAutoRefresh}
     * {@see #stopAutoRefresh}
     */ _removeVisibilityChangedCallback() {
        this._debug('#_removeVisibilityChangedCallback()');
        const callback = this.visibilityChangedCallback;
        this.visibilityChangedCallback = null;
        try {
            if (callback && (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
                window.removeEventListener('visibilitychange', callback);
            }
        } catch (e) {
            console.error('removing visibilitychange callback failed', e);
        }
    }
    /**
     * This is the private implementation of {@link #startAutoRefresh}. Use this
     * within the library.
     */ async _startAutoRefresh() {
        await this._stopAutoRefresh();
        this._debug('#_startAutoRefresh()');
        const ticker = setInterval(()=>this._autoRefreshTokenTick(), AUTO_REFRESH_TICK_DURATION);
        this.autoRefreshTicker = ticker;
        if (ticker && typeof ticker === 'object' && typeof ticker.unref === 'function') {
            // ticker is a NodeJS Timeout object that has an `unref` method
            // https://nodejs.org/api/timers.html#timeoutunref
            // When auto refresh is used in NodeJS (like for testing) the
            // `setInterval` is preventing the process from being marked as
            // finished and tests run endlessly. This can be prevented by calling
            // `unref()` on the returned object.
            ticker.unref();
        // @ts-ignore
        } else if (typeof Deno !== 'undefined' && typeof Deno.unrefTimer === 'function') {
            // similar like for NodeJS, but with the Deno API
            // https://deno.land/api@latest?unstable&s=Deno.unrefTimer
            // @ts-ignore
            Deno.unrefTimer(ticker);
        }
        // run the tick immediately, but in the next pass of the event loop so that
        // #_initialize can be allowed to complete without recursively waiting on
        // itself
        setTimeout(async ()=>{
            await this.initializePromise;
            await this._autoRefreshTokenTick();
        }, 0);
    }
    /**
     * This is the private implementation of {@link #stopAutoRefresh}. Use this
     * within the library.
     */ async _stopAutoRefresh() {
        this._debug('#_stopAutoRefresh()');
        const ticker = this.autoRefreshTicker;
        this.autoRefreshTicker = null;
        if (ticker) {
            clearInterval(ticker);
        }
    }
    /**
     * Starts an auto-refresh process in the background. The session is checked
     * every few seconds. Close to the time of expiration a process is started to
     * refresh the session. If refreshing fails it will be retried for as long as
     * necessary.
     *
     * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
     * to call this function, it will be called for you.
     *
     * On browsers the refresh process works only when the tab/window is in the
     * foreground to conserve resources as well as prevent race conditions and
     * flooding auth with requests. If you call this method any managed
     * visibility change callback will be removed and you must manage visibility
     * changes on your own.
     *
     * On non-browser platforms the refresh process works *continuously* in the
     * background, which may not be desirable. You should hook into your
     * platform's foreground indication mechanism and call these methods
     * appropriately to conserve resources.
     *
     * {@see #stopAutoRefresh}
     */ async startAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._startAutoRefresh();
    }
    /**
     * Stops an active auto refresh process running in the background (if any).
     *
     * If you call this method any managed visibility change callback will be
     * removed and you must manage visibility changes on your own.
     *
     * See {@link #startAutoRefresh} for more details.
     */ async stopAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._stopAutoRefresh();
    }
    /**
     * Runs the auto refresh token tick.
     */ async _autoRefreshTokenTick() {
        this._debug('#_autoRefreshTokenTick()', 'begin');
        try {
            await this._acquireLock(0, async ()=>{
                try {
                    const now = Date.now();
                    try {
                        return await this._useSession(async (result)=>{
                            const { data: { session } } = result;
                            if (!session || !session.refresh_token || !session.expires_at) {
                                this._debug('#_autoRefreshTokenTick()', 'no session');
                                return;
                            }
                            // session will expire in this many ticks (or has already expired if <= 0)
                            const expiresInTicks = Math.floor((session.expires_at * 1000 - now) / AUTO_REFRESH_TICK_DURATION);
                            this._debug('#_autoRefreshTokenTick()', `access token expires in ${expiresInTicks} ticks, a tick lasts ${AUTO_REFRESH_TICK_DURATION}ms, refresh threshold is ${AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                            if (expiresInTicks <= AUTO_REFRESH_TICK_THRESHOLD) {
                                await this._callRefreshToken(session.refresh_token);
                            }
                        });
                    } catch (e) {
                        console.error('Auto refresh tick failed with error. This is likely a transient error.', e);
                    }
                } finally{
                    this._debug('#_autoRefreshTokenTick()', 'end');
                }
            });
        } catch (e) {
            if (e.isAcquireTimeout || e instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$locks$2e$js__$5b$client$5d$__$28$ecmascript$29$__["LockAcquireTimeoutError"]) {
                this._debug('auto refresh token tick lock not available');
            } else {
                throw e;
            }
        }
    }
    /**
     * Registers callbacks on the browser / platform, which in-turn run
     * algorithms when the browser window/tab are in foreground. On non-browser
     * platforms it assumes always foreground.
     */ async _handleVisibilityChange() {
        this._debug('#_handleVisibilityChange()');
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isBrowser"])() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
            if (this.autoRefreshToken) {
                // in non-browser environments the refresh token ticker runs always
                this.startAutoRefresh();
            }
            return false;
        }
        try {
            this.visibilityChangedCallback = async ()=>await this._onVisibilityChanged(false);
            window === null || window === void 0 ? void 0 : window.addEventListener('visibilitychange', this.visibilityChangedCallback);
            // now immediately call the visbility changed callback to setup with the
            // current visbility state
            await this._onVisibilityChanged(true); // initial call
        } catch (error) {
            console.error('_handleVisibilityChange', error);
        }
    }
    /**
     * Callback registered with `window.addEventListener('visibilitychange')`.
     */ async _onVisibilityChanged(calledFromInitialize) {
        const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
        this._debug(methodName, 'visibilityState', document.visibilityState);
        if (document.visibilityState === 'visible') {
            if (this.autoRefreshToken) {
                // in browser environments the refresh token ticker runs only on focused tabs
                // which prevents race conditions
                this._startAutoRefresh();
            }
            if (!calledFromInitialize) {
                // called when the visibility has changed, i.e. the browser
                // transitioned from hidden -> visible so we need to see if the session
                // should be recovered immediately... but to do that we need to acquire
                // the lock first asynchronously
                await this.initializePromise;
                await this._acquireLock(-1, async ()=>{
                    if (document.visibilityState !== 'visible') {
                        this._debug(methodName, 'acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting');
                        // visibility has changed while waiting for the lock, abort
                        return;
                    }
                    // recover the session
                    await this._recoverAndRefresh();
                });
            }
        } else if (document.visibilityState === 'hidden') {
            if (this.autoRefreshToken) {
                this._stopAutoRefresh();
            }
        }
    }
    /**
     * Generates the relevant login URL for a third-party provider.
     * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
     * @param options.scopes A space-separated list of scopes granted to the OAuth application.
     * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
     */ async _getUrlForProvider(provider, options) {
        const urlParams = [
            `provider=${encodeURIComponent(provider)}`
        ];
        if (options === null || options === void 0 ? void 0 : options.redirectTo) {
            urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
        }
        if (options === null || options === void 0 ? void 0 : options.scopes) {
            urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
        }
        if (this.flowType === 'pkce') {
            const codeVerifier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEVerifier"])();
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["setItemAsync"])(this.storage, `${this.storageKey}-code-verifier`, codeVerifier);
            const codeChallenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$helpers$2e$js__$5b$client$5d$__$28$ecmascript$29$__["generatePKCEChallenge"])(codeVerifier);
            const codeChallengeMethod = codeVerifier === codeChallenge ? 'plain' : 's256';
            this._debug('PKCE', 'code verifier', `${codeVerifier.substring(0, 5)}...`, 'code challenge', codeChallenge, 'method', codeChallengeMethod);
            const flowParams = new URLSearchParams({
                code_challenge: `${encodeURIComponent(codeChallenge)}`,
                code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
            });
            urlParams.push(flowParams.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.queryParams) {
            const query = new URLSearchParams(options.queryParams);
            urlParams.push(query.toString());
        }
        return `${this.url}/authorize?${urlParams.join('&')}`;
    }
    async _unenroll(params) {
        try {
            return await this._useSession(async (result)=>{
                var _a;
                const { data: sessionData, error: sessionError } = result;
                if (sessionError) {
                    return {
                        data: null,
                        error: sessionError
                    };
                }
                return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'DELETE', `${this.url}/factors/${params.factorId}`, {
                    headers: this.headers,
                    jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
                });
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    /**
     * {@see GoTrueMFAApi#enroll}
     */ async _enroll(params) {
        try {
            return await this._useSession(async (result)=>{
                var _a, _b;
                const { data: sessionData, error: sessionError } = result;
                if (sessionError) {
                    return {
                        data: null,
                        error: sessionError
                    };
                }
                const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/factors`, {
                    body: {
                        friendly_name: params.friendlyName,
                        factor_type: params.factorType,
                        issuer: params.issuer
                    },
                    headers: this.headers,
                    jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
                });
                if (error) {
                    return {
                        data: null,
                        error
                    };
                }
                if ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code) {
                    data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
                }
                return {
                    data,
                    error: null
                };
            });
        } catch (error) {
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                return {
                    data: null,
                    error
                };
            }
            throw error;
        }
    }
    /**
     * {@see GoTrueMFAApi#verify}
     */ async _verify(params) {
        return this._acquireLock(-1, async ()=>{
            try {
                return await this._useSession(async (result)=>{
                    var _a;
                    const { data: sessionData, error: sessionError } = result;
                    if (sessionError) {
                        return {
                            data: null,
                            error: sessionError
                        };
                    }
                    const { data, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/factors/${params.factorId}/verify`, {
                        body: {
                            code: params.code,
                            challenge_id: params.challengeId
                        },
                        headers: this.headers,
                        jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
                    });
                    if (error) {
                        return {
                            data: null,
                            error
                        };
                    }
                    await this._saveSession(Object.assign({
                        expires_at: Math.round(Date.now() / 1000) + data.expires_in
                    }, data));
                    await this._notifyAllSubscribers('MFA_CHALLENGE_VERIFIED', data);
                    return {
                        data,
                        error
                    };
                });
            } catch (error) {
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                    return {
                        data: null,
                        error
                    };
                }
                throw error;
            }
        });
    }
    /**
     * {@see GoTrueMFAApi#challenge}
     */ async _challenge(params) {
        return this._acquireLock(-1, async ()=>{
            try {
                return await this._useSession(async (result)=>{
                    var _a;
                    const { data: sessionData, error: sessionError } = result;
                    if (sessionError) {
                        return {
                            data: null,
                            error: sessionError
                        };
                    }
                    return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$fetch$2e$js__$5b$client$5d$__$28$ecmascript$29$__["_request"])(this.fetch, 'POST', `${this.url}/factors/${params.factorId}/challenge`, {
                        headers: this.headers,
                        jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
                    });
                });
            } catch (error) {
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__["isAuthError"])(error)) {
                    return {
                        data: null,
                        error
                    };
                }
                throw error;
            }
        });
    }
    /**
     * {@see GoTrueMFAApi#challengeAndVerify}
     */ async _challengeAndVerify(params) {
        // both _challenge and _verify independently acquire the lock, so no need
        // to acquire it here
        const { data: challengeData, error: challengeError } = await this._challenge({
            factorId: params.factorId
        });
        if (challengeError) {
            return {
                data: null,
                error: challengeError
            };
        }
        return await this._verify({
            factorId: params.factorId,
            challengeId: challengeData.id,
            code: params.code
        });
    }
    /**
     * {@see GoTrueMFAApi#listFactors}
     */ async _listFactors() {
        // use #getUser instead of #_getUser as the former acquires a lock
        const { data: { user }, error: userError } = await this.getUser();
        if (userError) {
            return {
                data: null,
                error: userError
            };
        }
        const factors = (user === null || user === void 0 ? void 0 : user.factors) || [];
        const totp = factors.filter((factor)=>factor.factor_type === 'totp' && factor.status === 'verified');
        return {
            data: {
                all: factors,
                totp
            },
            error: null
        };
    }
    /**
     * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
     */ async _getAuthenticatorAssuranceLevel() {
        return this._acquireLock(-1, async ()=>{
            return await this._useSession(async (result)=>{
                var _a, _b;
                const { data: { session }, error: sessionError } = result;
                if (sessionError) {
                    return {
                        data: null,
                        error: sessionError
                    };
                }
                if (!session) {
                    return {
                        data: {
                            currentLevel: null,
                            nextLevel: null,
                            currentAuthenticationMethods: []
                        },
                        error: null
                    };
                }
                const payload = this._decodeJWT(session.access_token);
                let currentLevel = null;
                if (payload.aal) {
                    currentLevel = payload.aal;
                }
                let nextLevel = currentLevel;
                const verifiedFactors = (_b = (_a = session.user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor)=>factor.status === 'verified')) !== null && _b !== void 0 ? _b : [];
                if (verifiedFactors.length > 0) {
                    nextLevel = 'aal2';
                }
                const currentAuthenticationMethods = payload.amr || [];
                return {
                    data: {
                        currentLevel,
                        nextLevel,
                        currentAuthenticationMethods
                    },
                    error: null
                };
            });
        });
    }
}
GoTrueClient.nextInstanceID = 0; //# sourceMappingURL=GoTrueClient.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/lib/types.js [client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({});
;
 //# sourceMappingURL=types.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/index.js [client] (ecmascript) <locals>": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({});
;
;
;
;
;
;
 //# sourceMappingURL=index.js.map
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/index.js [client] (ecmascript) <module evaluation>": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, t: __turbopack_require_real__ } = __turbopack_context__;
{
__turbopack_esm__({});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueAdminApi$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueAdminApi.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueClient$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueClient.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$types$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/types.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$errors$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/errors.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$lib$2f$locks$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/lib/locks.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/index.js [client] (ecmascript) <locals>");
}}),
"[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueClient.js [client] (ecmascript) <export default as GoTrueClient>": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, t: __turbopack_require_real__ } = __turbopack_context__;
{
__turbopack_esm__({
    "GoTrueClient": (()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueClient$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"])
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$gotrue$2d$js$2f$dist$2f$module$2f$GoTrueClient$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/node_modules/@supabase/gotrue-js/dist/module/GoTrueClient.js [client] (ecmascript)");
}}),
}]);

//# sourceMappingURL=08b5e_%40supabase_gotrue-js_dist_module_b16fed._.js.map