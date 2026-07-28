import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
const buildScript = process.env.VESKRI_TAURI_BUILD_SCRIPT;

if (command !== "build" || args.length > 0 || !buildScript) {
  throw new Error(
    "tauri-action must invoke this wrapper as `build` with VESKRI_TAURI_BUILD_SCRIPT set.",
  );
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["run", buildScript], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
