const CHUNK_PUBLIC_PATH = "server/pages/_app.js";
const runtime = require("../chunks/ssr/[turbopack]_runtime.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__7f1f75._.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__47f7fa._.css");
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/stonks/pages/_app.tsx [ssr] (ecmascript)", CHUNK_PUBLIC_PATH).exports;
