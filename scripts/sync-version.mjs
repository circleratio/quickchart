#!/usr/bin/env node
// Reads src-tauri/tauri.conf.json's `version` (the single source of truth,
// see doc/spec.md §14) and propagates it into package.json and
// src-tauri/Cargo.toml. Run automatically as part of `npm run build`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriConfPath = join(rootDir, "src-tauri", "tauri.conf.json");
const packageJsonPath = join(rootDir, "package.json");
const cargoTomlPath = join(rootDir, "src-tauri", "Cargo.toml");

const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
const version = tauriConf.version;
if (!version) {
  console.error("tauri.conf.json has no `version` field");
  process.exit(1);
}

const packageJsonText = readFileSync(packageJsonPath, "utf-8");
const packageJson = JSON.parse(packageJsonText);
if (packageJson.version !== version) {
  packageJson.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`package.json version -> ${version}`);
}

const cargoToml = readFileSync(cargoTomlPath, "utf-8");
const updatedCargoToml = cargoToml.replace(/^version = "[^"]*"/m, `version = "${version}"`);
if (updatedCargoToml !== cargoToml) {
  writeFileSync(cargoTomlPath, updatedCargoToml);
  console.log(`Cargo.toml version -> ${version}`);
}

console.log(`Version sync complete (${version})`);
