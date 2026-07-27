import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const packagePath = resolve(root, "package.json");
const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
const tauriPath = resolve(root, "src-tauri", "tauri.conf.json");

const [packageJson, cargoToml, tauriConfig] = await Promise.all([
  readFile(packagePath, "utf8").then(JSON.parse),
  readFile(cargoPath, "utf8"),
  readFile(tauriPath, "utf8").then(JSON.parse),
]);

const packageStart = cargoToml.indexOf("[package]");
const nextSection = cargoToml.indexOf("\n[", packageStart + "[package]".length);
const cargoPackage = cargoToml.slice(
  packageStart,
  nextSection === -1 ? undefined : nextSection,
);
const cargoField = (name) =>
  cargoPackage.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

expect(
  packageJson.name === "wispr-type",
  "package.json name must be wispr-type.",
);
expect(
  Boolean(packageJson.description),
  "package.json requires a description.",
);
expect(Boolean(packageJson.author), "package.json requires an author.");
expect(packageJson.license === "MIT", "package.json license must be MIT.");
expect(cargoField("license") === "MIT", "Cargo.toml license must be MIT.");
expect(
  tauriConfig.bundle?.license === "MIT",
  "Tauri bundle license must be MIT.",
);
expect(
  packageJson.version === cargoField("version") &&
    packageJson.version === tauriConfig.version,
  "package.json, Cargo.toml, and tauri.conf.json versions must match.",
);
expect(
  packageJson.repository?.url ===
    "git+https://github.com/KingIronMan2011/wispr-type.git",
  "package.json repository URL is incorrect.",
);
expect(
  cargoField("repository") === "https://github.com/KingIronMan2011/wispr-type",
  "Cargo.toml repository URL is incorrect.",
);
expect(
  tauriConfig.bundle?.homepage ===
    "https://github.com/KingIronMan2011/wispr-type",
  "Tauri bundle homepage is incorrect.",
);
expect(
  tauriConfig.bundle?.publisher === "KingIronMan2011",
  "Tauri bundle publisher is missing.",
);
expect(
  /^([a-z][a-z0-9-]*\.)+[a-z][a-z0-9-]*$/.test(tauriConfig.identifier),
  "Tauri identifier must use reverse-domain notation.",
);

try {
  await access(resolve(root, "LICENSE"));
  await access(
    resolve(root, "src-tauri", tauriConfig.bundle?.licenseFile ?? ""),
  );
  await access(
    resolve(root, "src-tauri", tauriConfig.bundle?.macOS?.infoPlist ?? ""),
  );
} catch {
  errors.push(
    "A required bundle metadata file is missing or has an invalid path.",
  );
}

if (errors.length > 0) {
  console.error("Metadata validation failed:\n- " + errors.join("\n- "));
  process.exitCode = 1;
} else {
  console.log(`Metadata is valid for Wispr Type v${packageJson.version}.`);
}
