const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

let config = {
    mode: "development",
    entry: {
        "main": "./web/src/main.ts",
        "service-worker": "./web/src/service-worker.ts",
    },
    devServer: {
        https: false,
        port: 19823,
        static: path.resolve(__dirname, "dist"),
        open: true,
        watchFiles: ['web/src/**/*'],
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
                { from: "web/src/html", to: "" },
                { from: "web/resources/output", to: "" },
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
