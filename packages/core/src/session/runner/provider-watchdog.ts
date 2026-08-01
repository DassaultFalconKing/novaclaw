export * as ProviderWatchdog from "./provider-watchdog"

import { LLMError, TransportReason } from "@novaclaw/llm"
import { Effect, Stream } from "effect"
import type { ConfigProviderWatchdog } from "../../config/provider-watchdog"

export function timeoutError(kind: "inactivity" | "absolute", timeoutMs: number) {
  return new LLMError({
    module: "SessionRunner",
    method: "providerWatchdog",
    reason: new TransportReason({
      kind: "ProviderWatchdog",
      message:
        kind === "inactivity"
          ? `Provider emitted no stream event for ${timeoutMs} ms`
          : `Provider request exceeded ${timeoutMs} ms`,
    }),
  })
}

export function stream<A, E, R>(source: Stream.Stream<A, E, R>, config: ConfigProviderWatchdog.Resolved | undefined) {
  if (!config) return source
  return source.pipe(
    Stream.timeoutOrElse({
      duration: config.inactivityMs,
      orElse: () => Stream.fail(timeoutError("inactivity", config.inactivityMs)),
    }),
  )
}

export function effect<A, E, R>(source: Effect.Effect<A, E, R>, config: ConfigProviderWatchdog.Resolved | undefined) {
  if (!config) return source
  return source.pipe(
    Effect.timeoutOrElse({
      duration: config.absoluteMs,
      orElse: () => Effect.fail(timeoutError("absolute", config.absoluteMs)),
    }),
  )
}
