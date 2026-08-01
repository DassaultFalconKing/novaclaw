export * as ConfigRuntimeGuards from "./runtime-guards"

import { Schema } from "effect"

export class Info extends Schema.Class<Info>("Config.RuntimeGuards")({
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable bounded Session work guards independently of provider transport watchdogs",
  }),
  maxToolCallsPerTurn: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum provider-emitted tool calls accepted during one provider turn",
  }),
  maxToolCallsPerDrain: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum provider-emitted tool calls accepted during one Session drain",
  }),
  maxInboxBacklog: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum durable unpromoted inputs retained for one Session",
  }),
  maxStreamedOutputBytes: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum accumulated UTF-8 text, reasoning, and tool-input bytes during one provider turn",
  }),
}) {}

export interface Resolved {
  readonly maxToolCallsPerTurn: number
  readonly maxToolCallsPerDrain: number
  readonly maxInboxBacklog: number
  readonly maxStreamedOutputBytes: number
}

export const defaults: Resolved = {
  maxToolCallsPerTurn: 32,
  maxToolCallsPerDrain: 96,
  maxInboxBacklog: 128,
  maxStreamedOutputBytes: 8 * 1024 * 1024,
}

const positiveInt = (value: number | undefined, fallback: number) =>
  Math.max(1, Math.floor(Number.isFinite(value) ? (value ?? fallback) : fallback))

export function resolve(info: Info | undefined): Resolved | undefined {
  if (info?.enabled === false) return undefined
  return {
    maxToolCallsPerTurn: positiveInt(info?.maxToolCallsPerTurn, defaults.maxToolCallsPerTurn),
    maxToolCallsPerDrain: positiveInt(info?.maxToolCallsPerDrain, defaults.maxToolCallsPerDrain),
    maxInboxBacklog: positiveInt(info?.maxInboxBacklog, defaults.maxInboxBacklog),
    maxStreamedOutputBytes: positiveInt(info?.maxStreamedOutputBytes, defaults.maxStreamedOutputBytes),
  }
}
