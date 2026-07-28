import { describe, expect, test } from "bun:test"
import { publicAssetUrl } from "./public-asset"

describe("publicAssetUrl", () => {
  test("resolves a web asset from the origin root", () => {
    expect(publicAssetUrl("logo.png", "/", "https://novaclaw.test/session/example")).toBe(
      "https://novaclaw.test/logo.png",
    )
  })

  test("resolves an asset from a configured web base", () => {
    expect(publicAssetUrl("/logo.png", "/novaclaw/", "https://novaclaw.test/session/example")).toBe(
      "https://novaclaw.test/novaclaw/logo.png",
    )
  })

  test("resolves an Electron asset from the renderer directory", () => {
    expect(publicAssetUrl("logo.png", "./", "nc://renderer/index.html")).toBe("nc://renderer/logo.png")
  })
})
