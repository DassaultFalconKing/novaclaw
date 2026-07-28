#!/usr/bin/env bun

import path from "node:path"
import { frontendChunkBudget } from "../packages/app/frontend-chunks"

const output = path.resolve(process.argv[2] ?? "")
if (!process.argv[2]) throw new Error("Usage: bun script/check-frontend-chunks.ts <frontend-output>")

const html = Bun.file(path.join(output, "index.html"))
if (!(await html.exists())) throw new Error(`Frontend entry is missing: ${html.name}`)

const entryNames = [...(await html.text()).matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map((match) =>
  match[1]!.replace(/^\.?\//, ""),
)
if (!entryNames.length) throw new Error(`No frontend script entry found in ${html.name}`)

const assets = await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: output }))
const sizes = await Promise.all(
  assets.map(async (name) => ({
    name,
    bytes: Bun.file(path.join(output, name)).size,
  })),
)
const oversized = sizes.filter((item) => item.bytes > frontendChunkBudget.assetBytes)
const oversizedEntries = sizes.filter(
  (item) => entryNames.includes(item.name) && item.bytes > frontendChunkBudget.entryBytes,
)

if (oversized.length || oversizedEntries.length) {
  const details = [...oversizedEntries, ...oversized]
    .filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index)
    .map((item) => `${item.name}: ${item.bytes.toLocaleString()} bytes`)
    .join("\n")
  throw new Error(`Frontend chunk budget exceeded:\n${details}`)
}

const largest = sizes.toSorted((a, b) => b.bytes - a.bytes)[0]
const entry = sizes.filter((item) => entryNames.includes(item.name)).toSorted((a, b) => b.bytes - a.bytes)[0]
console.log(
  `Frontend chunks verified: entry ${entry?.bytes.toLocaleString() ?? "unknown"} bytes; largest ${largest?.bytes.toLocaleString() ?? "unknown"} bytes`,
)
