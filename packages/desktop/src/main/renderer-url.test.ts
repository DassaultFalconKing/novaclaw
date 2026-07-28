import { expect, test } from "bun:test"
import { resolveRendererDevUrl } from "./renderer-url"

test("ignores an inherited renderer dev URL in packaged builds", () => {
  expect(resolveRendererDevUrl(true, "http://localhost:5175")).toBeUndefined()
})

test("keeps the renderer URL for desktop development", () => {
  expect(resolveRendererDevUrl(false, "http://localhost:5175")).toBe("http://localhost:5175")
})
