const path = require("path");

module.exports = {
  entry: "./src/Progress.ts",
  target: "node",
  mode: "development",
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
    extensions: [".ts", ".js"],
  },
  output: {
    filename: "Progress.js",
    path: path.resolve(__dirname, "dist"),
    library: "Progress",
    libraryTarget: "umd",
  },
};
