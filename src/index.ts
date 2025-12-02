#!/usr/bin/env node

import { exec } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";

import { detect } from "package-manager-detector";

type Patcher = (pkg: string, dir: string) => Promise<void>;
type Runner = (pkg: string, fn: Patcher) => Promise<void>;

const $ = (command: string) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });

const withPnpmPatchEnv: Runner = async (pkg, fn) => {
    console.log(`⌛ Starting to patch package: ${pkg} ...`);

    const temp = path.resolve(process.cwd(), "node_modules/.temp", pkg);

    await fsp.rm(temp, { recursive: true, force: true });
    await $(`pnpm patch ${pkg} --edit-dir ${temp}`);

    try {
        await fn(pkg, temp);
    } catch (error) {
        console.log("❌ Failed to patch files");
        console.error(error);
        await fsp.rm(temp, { recursive: true, force: true });

        process.exit(1);
    }

    await $(`pnpm patch-commit ${temp}`);
    await fsp.rm(temp, { recursive: true, force: true });

    console.log("✅ Successfully patched files");
};

const withYarnPatchEnv: Runner = async (pkg, fn) => {
    console.log(`⌛ Starting to patch package: ${pkg} ...`);

    const { stdout } = await $(`yarn patch --json ${pkg}`);
    let temp = "";
    try {
        const json = JSON.parse(stdout);
        temp = json.path;
    } catch (error) {
        console.log("❌ Failed to parse yarn patch output");
        console.error(error);

        process.exit(1);
    }
    if (!temp) {
        console.log("❌ Failed to get yarn patch temp path");

        process.exit(1);
    }

    try {
        await fn(pkg, temp);
    } catch (error) {
        console.log("❌ Failed to patch files");
        console.error(error);

        process.exit(1);
    }

    await $(`yarn patch-commit -s ${temp}`);

    console.log("✅ Successfully patched files");
};

const withDefaultPatchEnv: Runner = async (pkg, fn) => {
    console.log(`⌛ Starting to patch package: ${pkg} ...`);

    const temp = path.resolve(process.cwd(), "node_modules", pkg);

    try {
        await fn(pkg, temp);
    } catch (error) {
        console.log("❌ Failed to patch files");
        console.error(error);

        process.exit(1);
    }

    console.log("✅ Successfully patched files");
};

const patch: Patcher = async (pkg, temp) => {
    const patches = [
        {
            filepath: "dist/esm/lib/typescript/writeConfigurationDefaults.js",
            handler: (content: string) => {
                const search = "writeFile or writeFileSync";
                const original = /^(\s*)((?:await )?(?:fs\.)?writeFile(?:Sync)?\(.*stringify\()/gm;
                const patched =
                    /^(\s*)\/\/ ((?:await )?(?:fs\.)?writeFile(?:Sync)?\(.*stringify\()/gm;
                if (!original.test(content)) {
                    if (patched.test(content)) {
                        console.log("✅ File already patched, skipping ...");

                        return content;
                    }

                    throw new Error(`Search string not found: \`${search}\``);
                }

                return content.replaceAll(original, `$1// $2`);
            },
        },
        {
            filepath: "dist/lib/typescript/writeConfigurationDefaults.js",
            handler: (content: string) => {
                const search = "writeFile or writeFileSync";
                const original =
                    /^(\s*)((?:await )?(?:\(0, )?(?:_fs\.)?(?:promises\.)?writeFile(?:Sync)?(?:\))?\(.*stringify\()/gm;
                const patched =
                    /^(\s*)\/\/ ((?:await )?(?:\(0, )?(?:_fs\.)?(?:promises\.)?writeFile(?:Sync)?(?:\))?\(.*stringify\()/gm;
                if (!original.test(content)) {
                    if (patched.test(content)) {
                        console.log("✅ File already patched, skipping ...");

                        return content;
                    }

                    throw new Error(`Search string not found: \`${search}\``);
                }

                return content.replaceAll(original, `$1// $2`);
            },
        },
    ];

    for (const patch of patches) {
        const filepath = path.resolve(temp, patch.filepath);
        const relative = path.join(pkg, patch.filepath);
        const content = await fsp.readFile(filepath, { encoding: "utf-8" });

        if (!content) {
            throw new Error(`File not exits or empty: ${relative}`);
        }

        console.log(`⌛ Patching file: ${relative} ...`);
        try {
            const patched = patch.handler(content);
            await fsp.writeFile(filepath, patched);
        } catch (error) {
            console.log(`❌ Failed to patch file`);
            throw error;
        }
    }
};

const run: Runner = async (...params) => {
    const res = await detect({
        strategies: ["install-metadata", "lockfile", "packageManager-field", "devEngines-field"],
    });
    if (!res) {
        console.log("❌ No package manager found");
        process.exit(1);
    }

    const { agent } = res;
    switch (agent) {
        case "pnpm": {
            await withPnpmPatchEnv(...params);
            break;
        }
        case "yarn@berry": {
            await withYarnPatchEnv(...params);
            break;
        }
        default: {
            await withDefaultPatchEnv(...params);
        }
    }
};

run("next", patch);
