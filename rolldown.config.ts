import { defineConfig } from "rolldown";

export default defineConfig({
    input: "src/index.ts",

    output: {
        file: "bin/index.js",
        format: "esm",
    },

    platform: "node",
});
