export * as ConfigProviderWatchdog from "./provider-watchdog"

import { Schema } from "effect"

export class Info extends Schema.Class<Info>("Config.ProviderWatchdog")({
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable provider inactivity and absolute-turn watchdogs",
  }),
  inactivityMs: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum time without a provider stream event before the request is interrupted",
  }),
  absoluteMs: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Maximum wall-clock duration of one provider request",
  }),
}) {}

export interface Resolved {
  readonly inactivityMs: number
  readonly absoluteMs: number
}

export function resolve(info: Info | undefined): Resolved | undefined {
  if (info?.enabled !== true) return undefined
  return {
    inactivityMs: Math.max(1_000, info.inactivityMs ?? 120_000),
    absoluteMs: Math.max(1_000, info.absoluteMs ?? 900_000),
  }
}
