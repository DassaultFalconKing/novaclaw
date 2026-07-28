import { describe, expect, test } from "bun:test"
import { GlobalBus, type GlobalEvent } from "@/bus/global"

describe("GlobalBus", () => {
  test("assigns an event ID before notifying listeners and supports cleanup", () => {
    const received: GlobalEvent[] = []
    const listener = (event: GlobalEvent) => received.push(event)

    GlobalBus.on("event", listener)
    GlobalBus.emit("event", { payload: { type: "test" } })
    GlobalBus.off("event", listener)
    GlobalBus.emit("event", { payload: { type: "ignored" } })

    expect(received).toHaveLength(1)
    expect(received[0]!.payload.id).toMatch(/^evt_/)
  })

  test("reuses the sync event ID", () => {
    const event: GlobalEvent = { payload: { type: "test", syncEvent: { id: "evt_sync" } } }

    GlobalBus.emit("event", event)

    expect(event.payload.id).toBe("evt_sync")
  })
})
