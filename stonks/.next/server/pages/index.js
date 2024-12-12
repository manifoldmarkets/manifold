const CHUNK_PUBLIC_PATH = "server/pages/index.js";
const runtime = require("../chunks/ssr/[turbopack]_runtime.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__a4d3b2._.js");
runtime.loadChunk("server/chunks/ssr/[project]__a70fe1._.js");
runtime.loadChunk("server/chunks/ssr/[root of the server]__47f7fa._.css");
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/stonks/node_modules/next/dist/esm/build/templates/pages.js { INNER_PAGE => \"[project]/stonks/pages/index.tsx [ssr] (ecmascript)\", INNER_DOCUMENT => \"[project]/stonks/node_modules/next/document.js [ssr] (ecmascript)\", INNER_APP => \"[project]/stonks/pages/_app.tsx [ssr] (ecmascript)\" } [ssr] (ecmascript)", CHUNK_PUBLIC_PATH).exports;
