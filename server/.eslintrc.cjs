module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    parserOptions: {
        sourceType: "module",
        ecmaFeatures: {
            modules: true,
        },
    },
    plugins: ["@typescript-eslint"],
    extends: [
        // 'airbnb-base',
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    env: {
        browser: true,
        amd: true,
        node: true,
    },
};
