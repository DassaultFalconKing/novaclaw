import { describe, expect, test } from "bun:test"
import { createHomeTileClickGuard } from "./home-tile-click-guard"

describe("createHomeTileClickGuard", () => {
  test("suppresses a trailing launcher click after a drag", () => {
    const guard = createHomeTileClickGuard()
    guard.begin({ pointerID: 7, x: 10, y: 10 })
    guard.move({ pointerID: 7, x: 25, y: 10 })

    expect(guard.shouldSuppress()).toBe(true)
  })

  test("does not suppress a click after a tap or another pointer moves", () => {
    const guard = createHomeTileClickGuard()
    guard.begin({ pointerID: 7, x: 10, y: 10 })
    guard.move({ pointerID: 8, x: 50, y: 50 })
    guard.move({ pointerID: 7, x: 18, y: 10 })

    expect(guard.shouldSuppress()).toBe(false)
  })

  test("keeps the trailing click guarded until the caller clears it", () => {
    const guard = createHomeTileClickGuard()
    guard.begin({ pointerID: 7, x: 10, y: 10 })
    guard.move({ pointerID: 7, x: 25, y: 10 })

    expect(guard.end(7)).toBe(true)
    expect(guard.shouldSuppress()).toBe(true)
    guard.clear()
    expect(guard.shouldSuppress()).toBe(false)
  })
})
