import { describe, expect, test } from "bun:test"
import { FinishRecovery } from "./finish-recovery"

describe("FinishRecovery.decide", () => {
  test("recovers one terminal length finish", () => {
    const state = FinishRecovery.initialState()
    expect(FinishRecovery.decide("length", false, state).kind).toBe("continue")
    state.recoveries++
    expect(FinishRecovery.decide("length", false, state).kind).toBe("stop")
  })

  test("does not duplicate an existing tool continuation", () => {
    expect(FinishRecovery.decide("length", true, FinishRecovery.initialState()).kind).toBe("none")
  })

  test("restores the legacy stop when the completion guard is disabled", () => {
    expect(FinishRecovery.decide("length", false, FinishRecovery.initialState(), false).kind).toBe("none")
  })

  test("ignores ordinary finishes", () => {
    expect(FinishRecovery.decide("stop", false, FinishRecovery.initialState()).kind).toBe("none")
    expect(FinishRecovery.decide(undefined, false, FinishRecovery.initialState()).kind).toBe("none")
  })
})
