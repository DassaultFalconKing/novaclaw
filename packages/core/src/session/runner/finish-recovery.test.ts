import { describe, expect, test } from "bun:test"
import { FinishRecovery } from "./finish-recovery"

describe("FinishRecovery.decide", () => {
  test("recovers one terminal length finish", () => {
    const state = FinishRecovery.initialState()
    expect(FinishRecovery.decide("length", false, state).kind).toBe("continue")
    expect(state.recoveries).toBe(1)
    expect(FinishRecovery.decide("length", false, state).kind).toBe("stop")
    expect(state.recoveries).toBe(2)
  })

  test("does not duplicate an existing tool continuation", () => {
    expect(FinishRecovery.decide("length", true, FinishRecovery.initialState()).kind).toBe("none")
  })

  test("ignores ordinary finishes", () => {
    const state = FinishRecovery.initialState()
    expect(FinishRecovery.decide("stop", false, state).kind).toBe("none")
    expect(FinishRecovery.decide(undefined, false, FinishRecovery.initialState()).kind).toBe("none")
    expect(state.recoveries).toBe(0)
  })

  test("an intervening ordinary finish does not reset the per-drain allowance", () => {
    const state = FinishRecovery.initialState()
    expect(FinishRecovery.decide("length", false, state).kind).toBe("continue")
    expect(FinishRecovery.decide("stop", false, state).kind).toBe("none")
    expect(FinishRecovery.decide("length", false, state).kind).toBe("stop")
  })
})
