import { describe, expect, test } from "bun:test"
import { DateTime } from "effect"
import { ModelV2 } from "../model"
import { ProviderV2 } from "../provider"
import { SessionMessage } from "../session/message"
import { ExitTool } from "./exit"

const now = DateTime.nowUnsafe()

const context = (error?: string): SessionMessage.Message[] =>
  error === undefined
    ? []
    : [
        SessionMessage.Assistant.make({
          id: SessionMessage.ID.create(),
          type: "assistant",
          agent: "test",
          model: { id: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test") },
          content: [
            {
              type: "tool",
              id: "exit-1",
              name: "exit",
              state: {
                status: "error",
                input: {},
                content: [],
                structured: {},
                error: { type: "unknown", message: error },
              },
              time: { created: now },
            },
          ],
          time: { created: now },
        }),
      ]

describe("ExitTool.gateDecision", () => {
  test("does not gate attended or delegated sessions", () => {
    expect(ExitTool.gateDecision({ type: "interactive", context: [] })).toBe("allow")
    expect(ExitTool.gateDecision({ type: "sub-agent", context: [] })).toBe("allow")
  })

  test("restores the legacy one-phase exit when the completion guard is disabled", () => {
    expect(ExitTool.gateDecision({ enabled: false, type: "goal-oriented", context: [] })).toBe("allow")
  })

  test("requires a separate confirmation turn for unattended sessions", () => {
    expect(ExitTool.gateDecision({ type: "auto-prompting", evidence: "already supplied", context: [] })).toBe("confirm")
    expect(ExitTool.gateDecision({ type: "goal-oriented", context: [] })).toBe("confirm")
  })

  test("requires evidence after confirmation and then allows completion", () => {
    const history = context(`${ExitTool.CONFIRMATION_REQUIRED}: verify first`)
    expect(ExitTool.gateDecision({ type: "goal-oriented", context: history })).toBe("evidence")
    expect(ExitTool.gateDecision({ type: "goal-oriented", evidence: "tests pass", context: history })).toBe("allow")
  })
})
