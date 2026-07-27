#!/usr/bin/env bun

import { Script } from "@novaclaw/script"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

process.chdir(dir)

const generated = await import("./generate.ts")

const result = await Bun.build({
  target: "node",
  conditions: ["node"],
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@ladybugdb/wasm-core", "@lydell/node-pty", "@mtcute/bun"],
  define: {
    NOVACLAW_MODELS_DEV: generated.modelsData,
    NOVACLAW_CHANNEL: `'${Script.channel}'`,
  },
  files: {
    "novaclaw-web-ui.gen.ts": "",
  },
})

if (!result.success) throw new AggregateError(result.logs, "Node sidecar build failed")

if (/\b(?:from|import\(|require\()\s*["']bun:/.test(await Bun.file("./dist/node/node.js").text()))
  throw new Error("Node sidecar bundle contains a bun: runtime import")

console.log("Build complete")
