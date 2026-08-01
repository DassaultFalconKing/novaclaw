import { describe, expect, test } from "bun:test"
import { parseMcpServer } from "./integrations-model"

describe("parseMcpServer", () => {
  test("preserves a local command argv without shell parsing", () => {
    expect(parseMcpServer("local", '["bunx","-y","server package"]')).toEqual({
      type: "local",
      command: ["bunx", "-y", "server package"],
    })
  })

  test("rejects malformed or empty local commands", () => {
    expect(parseMcpServer("local", "bunx server")).toBeUndefined()
    expect(parseMcpServer("local", "[]")).toBeUndefined()
    expect(parseMcpServer("local", '["bunx", 1]')).toBeUndefined()
  })

  test("accepts HTTP endpoints and rejects non-network protocols", () => {
    expect(parseMcpServer("remote", "https://mcp.example.test/api")).toEqual({
      type: "remote",
      url: "https://mcp.example.test/api",
    })
    expect(parseMcpServer("remote", "file:///tmp/mcp.sock")).toBeUndefined()
  })
})
