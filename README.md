## Stop Next.js from messing with tsconfig.json

When using TypeScript in a Next.js project, Next.js may automatically modify the `tsconfig.json` file at startup. This can cause some issues, especially if you want to maintain specific configurations. So I wrote this small tool to patch Next.js code to prevent it.

## Usage

Run the following command directly in your Next.js project:

```bash
npx stop-nextjs-from-messing-tsconfig
```

## Under the hood

This small tool will first try to detect the package manager used in the project.

If it is `npm` or `yarn` (classic), it will directly modify the `node_modules/next/dist/esm/lib/typescript/writeConfigurationDefaults.js` and `node_modules/next/dist/lib/typescript/writeConfigurationDefaults.js` files, commenting out the part of the `writeConfigurationDefaults` function that writes to `tsconfig.json`.

If it is `pnpm` or `yarn` (berry), it will first call the corresponding `patch` command, then modify the above files, and finally generate a patch file.
