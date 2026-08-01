export * as RuntimeGuards from "./runtime-guards"

import type { LLMEvent } from "@novaclaw/llm"
import { Schema } from "effect"
import type { ConfigRuntimeGuards } from "../../config/runtime-guards"

export const Kind = Schema.Literals(["tool_calls_turn", "tool_calls_drain", "streamed_output"])
export type Kind = typeof Kind.Type

export class Stop extends Schema.TaggedErrorClass<Stop>()("SessionRunner.RuntimeGuardStop", {
  kind: Kind,
  limit: Schema.Number,
  observed: Schema.Number,
  message: Schema.String,
}) {}

export interface DrainState {
  toolCalls: number
}

export interface TurnState {
  toolCalls: number
  streamedOutputBytes: number
  readonly streamedToolInput: Set<string>
}

export const initialDrainState = (): DrainState => ({ toolCalls: 0 })
export const initialTurnState = (): TurnState => ({
  toolCalls: 0,
  streamedOutputBytes: 0,
  streamedToolInput: new Set(),
})

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength

const toolInput = (event: Extract<LLMEvent, { readonly type: "tool-call" }>) => {
  if (typeof event.input === "string") return event.input
  try {
    return JSON.stringify(event.input) ?? String(event.input)
  } catch {
    return String(event.input)
  }
}

export function observe(
  event: LLMEvent,
  config: ConfigRuntimeGuards.Resolved | undefined,
  drain: DrainState,
  turn: TurnState,
): Stop | undefined {
  if (!config) return undefined

  if (event.type === "tool-call") {
    turn.toolCalls++
    drain.toolCalls++
    if (turn.toolCalls > config.maxToolCallsPerTurn)
      return new Stop({
        kind: "tool_calls_turn",
        limit: config.maxToolCallsPerTurn,
        observed: turn.toolCalls,
        message: `Provider turn exceeded the ${config.maxToolCallsPerTurn} tool-call limit`,
      })
    if (drain.toolCalls > config.maxToolCallsPerDrain)
      return new Stop({
        kind: "tool_calls_drain",
        limit: config.maxToolCallsPerDrain,
        observed: drain.toolCalls,
        message: `Session drain exceeded the ${config.maxToolCallsPerDrain} tool-call limit`,
      })
  }

  const bytes = (() => {
    if (event.type === "text-delta" || event.type === "reasoning-delta") return utf8Bytes(event.text)
    if (event.type === "tool-input-delta") {
      turn.streamedToolInput.add(event.id)
      return utf8Bytes(event.text)
    }
    if (event.type === "tool-call" && !turn.streamedToolInput.has(event.id)) return utf8Bytes(toolInput(event))
    return 0
  })()
  turn.streamedOutputBytes += bytes
  if (turn.streamedOutputBytes <= config.maxStreamedOutputBytes) return undefined
  return new Stop({
    kind: "streamed_output",
    limit: config.maxStreamedOutputBytes,
    observed: turn.streamedOutputBytes,
    message: `Provider turn exceeded the ${config.maxStreamedOutputBytes}-byte streamed-output limit`,
  })
}

export function notice(stop: Stop) {
  const label =
    stop.kind === "tool_calls_turn"
      ? "tool calls in one provider turn"
      : stop.kind === "tool_calls_drain"
        ? "tool calls in one Session drain"
        : "streamed provider output bytes"
  return (
    `⚠️ NovaClaw paused this Session after ${stop.observed} ${label}; the configured limit is ${stop.limit}. ` +
    "Completed tool results were preserved. A call stopped at the guard boundary was not executed locally, and " +
    "NovaClaw will not replay tools automatically. Inspect the latest transcript and send `resume` when ready."
  )
}
