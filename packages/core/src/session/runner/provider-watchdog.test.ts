import { expect, test } from "bun:test"
import { Cause, Effect, Exit, Option, Stream } from "effect"
import { LLMError } from "@novaclaw/llm"
import { ConfigProviderWatchdog } from "../../config/provider-watchdog"
import { ProviderWatchdog } from "./provider-watchdog"

test("watchdog is opt-in and resolves editable defaults", () => {
  expect(ConfigProviderWatchdog.resolve(undefined)).toBeUndefined()
  expect(ConfigProviderWatchdog.resolve(new ConfigProviderWatchdog.Info({ enabled: false }))).toBeUndefined()
  expect(ConfigProviderWatchdog.resolve(new ConfigProviderWatchdog.Info({ enabled: true }))).toEqual({
    inactivityMs: 120_000,
    absoluteMs: 900_000,
  })
})

test("inactivity watchdog fails a silent stream with a transient transport error", async () => {
  const exit = await Effect.runPromiseExit(
    ProviderWatchdog.stream(Stream.never, { inactivityMs: 5, absoluteMs: 1_000 }).pipe(Stream.runCollect),
  )
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) return
  const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  expect(failure).toBeInstanceOf(LLMError)
  expect((failure as LLMError).reason._tag).toBe("Transport")
  expect((failure as LLMError).reason.message).toContain("no stream event")
})

test("absolute watchdog fails a request even when it is not waiting on a stream pull", async () => {
  const exit = await Effect.runPromiseExit(
    ProviderWatchdog.effect(Effect.never, { inactivityMs: 1_000, absoluteMs: 5 }),
  )
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) return
  const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  expect(failure).toBeInstanceOf(LLMError)
  expect((failure as LLMError).reason.message).toContain("exceeded")
})
