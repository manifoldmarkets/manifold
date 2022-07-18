const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

let config = {
    mode: "development",
    entry: {
        main: "/src/main.ts",
        "service-worker": "/src/service-worker.ts",
    },
    devServer: {
        https: false,
        port: 19823,
        static: path.resolve(__dirname, "dist"),
        open: true,
        watchFiles: ["src/**/*"],
        proxy: {
            "/api": {
                target: "http://localhost:9172",
                pathRewrite: {
                    "^/api": "",
                },
            },
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
            {
                test: /\.s[ac]ss$/i,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
            },
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output. Both options are optional
            filename: "[name].css",
            chunkFilename: "[id].css",
        }),
        new CopyPlugin({
            patterns: [
                { from: "src/html", to: "" },
                { from: "resources/output", to: "" },
            ],
        }),
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    },
    output: {
        clean: true,
    },
};

module.exports = (env, argv) => {
    if (argv.mode !== "production") {
        config.devtool = "inline-source-map";
    }

    return config;
};
