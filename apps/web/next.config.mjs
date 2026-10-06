export default {
  output: "export",
  trailingSlash: true,
  basePath: (process.env.PANCO_BASE_PATH || "").replace(/\/$/, ""),
  transpilePackages: ["@panco/core", "@panco/react-features"],
  poweredByHeader: false,
};
