import { describe, expect, test } from "bun:test"
import { frontendChunk, frontendChunkBudget } from "./frontend-chunks"

describe("frontend chunks", () => {
  test("keeps the entry and asset budgets explicit", () => {
    expect(frontendChunkBudget.entryBytes).toBeLessThan(frontendChunkBudget.assetBytes)
    expect(frontendChunkBudget.assetBytes).toBe(1_000_000)
  })

  test("groups application and workspace modules", () => {
    expect(frontendChunk("/repo/packages/app/src/components/settings-v2/models.tsx")).toBe("novaclaw-settings")
    expect(frontendChunk("/repo/packages/app/src/pages/session.tsx")).toBeUndefined()
    expect(frontendChunk("/repo/packages/session-ui/src/components/file.tsx")).toBeUndefined()
    expect(frontendChunk("/repo/packages/ui/src/icon.tsx")).toBe("novaclaw-ui")
    expect(frontendChunk("/repo/packages/core/src/session.ts")).toBe("novaclaw-runtime")
  })

  test("groups heavy third-party families on POSIX and Windows paths", () => {
    expect(frontendChunk("/repo/node_modules/.bun/effect@4/node_modules/effect/dist/Effect.js")).toBe("vendor-effect")
    expect(frontendChunk("/repo/node_modules/.bun/katex@1/node_modules/katex/dist/katex.mjs")).toBe("vendor-markdown")
    expect(frontendChunk(String.raw`C:\repo\node_modules\.bun\solid-js@1\node_modules\solid-js\dist\solid.js`)).toBe(
      "vendor-solid-ui",
    )
    expect(frontendChunk("/repo/node_modules/.bun/ghostty-web@1/node_modules/ghostty-web/index.js")).toBe(
      "vendor-terminal",
    )
    expect(frontendChunk("/repo/node_modules/.bun/shiki@1/node_modules/shiki/dist/index.mjs")).toBeUndefined()
    expect(frontendChunk("/repo/node_modules/.bun/zod@1/node_modules/zod/index.js")).toBeUndefined()
  })
})
