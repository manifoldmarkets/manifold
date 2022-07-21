const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

let config = {
    mode: "development",
    entry: {
        main: "/src/main.ts",
        main2: "/src/main.ts",
        "service-worker": "/src/service-worker.ts",
    },
    devServer: {
        https: false,
        port: 19823,
        static: path.resolve(__dirname, "dist"),
        open: false,
        watchFiles: ["src/**/*"],
        proxy: {
            "/api": {
                target: "http://localhost:9172",
                pathRewrite: {
                    "^/api": "",
                },
            },
            "/socket.io": {
                target: "http://localhost:3000",
            },
        },
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    compress: {
                        drop_console: true,
                    },
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
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
