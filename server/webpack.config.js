import path from 'path';

export default {
  mode: 'production',
  entry: './src/index.ts',
  target: 'node',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve('./dist'),
    clean: true,
  },
  ignoreWarnings: [
    {
      module: /node_modules\/express\/lib\/view\.js/,
      message: /the request of a dependency is an expression/,
    },
    {
      module: /node_modules\/@google-cloud\/logging\/build\/src\/utils\/instrumentation\.js/,
      message: /the request of a dependency is an expression/,
    },
  ],
};
