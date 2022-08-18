import path from "path";

export default {
    mode: "production",
    entry: "./src/index.ts",
    target: "node",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    output: {
        filename: "bundle.js",
        path: path.resolve("./dist"),
        clean: true,
    },
    externals: {
        bufferutil: "bufferutil",
        "utf-8-validate": "utf-8-validate",
        // express: { commonjs: "express" },
    },
};
