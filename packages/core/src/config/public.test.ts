import { describe, expect, test } from "bun:test"
import { ConfigPublic } from "./public"

describe("ConfigPublic", () => {
  test("removes MCP transport secrets and endpoints from the renderer/export projection", () => {
    const projected = ConfigPublic.redact({
      mcp: {
        servers: {
          local: {
            type: "local",
            command: ["secret-bin", "--token", "command-secret"],
            environment: { API_KEY: "environment-secret" },
          },
          remote: {
            type: "remote",
            url: "https://token-secret@example.test/mcp?key=query-secret",
            headers: { Authorization: "Bearer header-secret" },
            oauth: { client_id: "public-id", client_secret: "oauth-secret" },
          },
        },
      },
    })
    const serialized = JSON.stringify(projected)

    for (const secret of [
      "secret-bin",
      "command-secret",
      "environment-secret",
      "token-secret",
      "query-secret",
      "header-secret",
      "oauth-secret",
    ])
      expect(serialized).not.toContain(secret)
    expect(serialized).toContain(ConfigPublic.REDACTED)
    expect(serialized).toContain("public-id")
  })

  test("strips placeholders before a public config is patch-merged back into stored config", () => {
    expect(
      ConfigPublic.stripRedacted({
        type: "remote",
        url: ConfigPublic.REDACTED,
        headers: { Authorization: ConfigPublic.REDACTED },
        disabled: true,
      }),
    ).toEqual({ type: "remote", headers: {}, disabled: true })
  })
})
