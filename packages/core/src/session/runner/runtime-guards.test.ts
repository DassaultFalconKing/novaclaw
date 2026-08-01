import { describe, expect, test } from "bun:test"
import { LLMEvent } from "@novaclaw/llm"
import { ConfigRuntimeGuards } from "../../config/runtime-guards"
import { RuntimeGuards } from "./runtime-guards"

describe("runtime guards", () => {
  test("resolves finite positive defaults and supports an explicit off switch", () => {
    expect(ConfigRuntimeGuards.resolve(undefined)).toEqual(ConfigRuntimeGuards.defaults)
    expect(ConfigRuntimeGuards.resolve(new ConfigRuntimeGuards.Info({ enabled: false }))).toBeUndefined()
    expect(
      ConfigRuntimeGuards.resolve(
        new ConfigRuntimeGuards.Info({ maxToolCallsPerTurn: 2.9, maxToolCallsPerDrain: 0, maxInboxBacklog: -5 }),
      ),
    ).toMatchObject({ maxToolCallsPerTurn: 2, maxToolCallsPerDrain: 1, maxInboxBacklog: 1 })
  })

  test("separates provider-turn and drain tool-call limits", () => {
    const config = { ...ConfigRuntimeGuards.defaults, maxToolCallsPerTurn: 2, maxToolCallsPerDrain: 3 }
    const drain = RuntimeGuards.initialDrainState()
    const first = RuntimeGuards.initialTurnState()
    expect(RuntimeGuards.observe(LLMEvent.toolCall({ id: "1", name: "read", input: {} }), config, drain, first)).toBeUndefined()
    expect(RuntimeGuards.observe(LLMEvent.toolCall({ id: "2", name: "read", input: {} }), config, drain, first)).toBeUndefined()
    expect(
      RuntimeGuards.observe(LLMEvent.toolCall({ id: "3", name: "read", input: {} }), config, drain, first)?.kind,
    ).toBe("tool_calls_turn")

    const next = RuntimeGuards.initialTurnState()
    expect(
      RuntimeGuards.observe(LLMEvent.toolCall({ id: "4", name: "read", input: {} }), config, drain, next)?.kind,
    ).toBe("tool_calls_drain")
  })

  test("counts UTF-8 deltas and does not double-count a streamed tool input", () => {
    const config = { ...ConfigRuntimeGuards.defaults, maxStreamedOutputBytes: 5 }
    const drain = RuntimeGuards.initialDrainState()
    const turn = RuntimeGuards.initialTurnState()
    expect(RuntimeGuards.observe(LLMEvent.textDelta({ id: "text", text: "é" }), config, drain, turn)).toBeUndefined()
    expect(
      RuntimeGuards.observe(LLMEvent.toolInputDelta({ id: "call", name: "read", text: "{}" }), config, drain, turn),
    ).toBeUndefined()
    expect(
      RuntimeGuards.observe(LLMEvent.toolCall({ id: "call", name: "read", input: { path: "ignored" } }), config, drain, turn),
    ).toBeUndefined()
    expect(RuntimeGuards.observe(LLMEvent.textDelta({ id: "text", text: "ab" }), config, drain, turn)?.kind).toBe(
      "streamed_output",
    )
  })
})
