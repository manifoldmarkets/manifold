const CHUNK_PUBLIC_PATH = "server/pages/_error.js";
const runtime = require("../chunks/ssr/[turbopack]_runtime.js");
runtime.loadChunk("server/chunks/ssr/[project]__8a74b5._.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__0a9357._.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__f749e8._.css");
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/stonks/node_modules/next/dist/esm/build/templates/pages.js { INNER_PAGE => \"[project]/stonks/node_modules/next/error.js [ssr] (ecmascript)\", INNER_DOCUMENT => \"[project]/stonks/node_modules/next/document.js [ssr] (ecmascript)\", INNER_APP => \"[project]/stonks/pages/_app.tsx [ssr] (ecmascript)\" } [ssr] (ecmascript)", CHUNK_PUBLIC_PATH).exports;
