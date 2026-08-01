# NovaClaw agent reliability implementation plan

Status: R0-R3 delivered; native Session-based R4 slice and MCP security/reliability slice delivered; context parity and admin UX remain  
Branch: `agent-integrations-fix`  
Started: 2026-08-01

## Goal

Make a local NovaClaw Session recover predictably from three independent failures:

1. the provider stream disconnects;
2. the renderer/SSE connection reconnects while a response is still streaming;
3. the NovaClaw process exits after provider dispatch or during tool settlement.

The implementation must preserve the durable transcript and must never automatically replay a tool whose side effect may already have happened.

## Invariants

- One explicit `llm.stream(request)` call remains the provider-turn boundary.
- Provider dispatch is considered ambiguous from the moment its durable attempt marker is written until settlement.
- A normal failure, Stop, or completed turn settles its attempt; only process loss leaves an open marker.
- An open attempt is visible on the Session record after restart and is never silently auto-retried.
- A later explicit continuation may proceed from projected history, but orphaned tools first settle as unknown-outcome failures and the continuation is told not to repeat them without inspecting state.
- Stream snapshots contain accumulated text/reasoning/tool input and replace client state; ephemeral deltas still provide low-latency rendering.
- Snapshots are bounded by cadence/size, not persisted for every token.
- Watchdogs interrupt provider transport only. They do not manufacture successful turns or replay tools.

## Phase R0 — existing fixes

- Persistent MCP and skill-source Settings UI.
- One bounded in-process transient stream continuation before tool protocol begins.
- Single URL-owned Session view and Linux Alt-menu focus fix.

## Phase R1 — durable provider attempts

1. Add `Session.ProviderRecovery` to the public Session record.
2. Add a nullable SQLite `session.provider_recovery` projection and migration.
3. Add durable `session.next.provider-attempt.started/settled/abandoned` events.
4. Publish `started` immediately before the provider call and settle in every ordinary exit path.
5. At drain start, detect a marker left by process loss, publish a visible notice, fail incomplete tools with an explicit unknown-outcome error, and continue only because a new user input or explicit resume started the drain.
6. Fold attempt events into every open client Session record so the UI does not require reload.
7. Show a non-modal recovery dock above the composer.

Acceptance:

- kill-after-dispatch leaves `providerRecovery` in SQLite;
- normal success/failure/Stop clears it;
- restart does not call the provider until new user authority arrives;
- an incomplete tool is not executed again by recovery code.

## Phase R2 — reconnect-safe stream snapshots

1. Add durable `Progress` boundaries for text, reasoning, and tool input.
2. Publish accumulated snapshots at a bounded byte/time cadence.
3. Make server and in-memory projectors replace accumulated content on `Progress`.
4. On SSE reconnect, the existing scoped query invalidation reloads the latest durable snapshot; subsequent deltas resume from that baseline.

Acceptance:

- disconnect/reconnect during a long response converges to the exact final text;
- replay from a durable cursor reconstructs the latest checkpoint without live deltas;
- event volume stays bounded independently of token count.

## Phase R3 — provider watchdog and backoff

1. [x] Add optional provider inactivity and absolute-turn timeouts to runtime settings.
2. [x] Reset inactivity on every provider event; classify timeout as transient transport failure.
3. [x] Reuse the bounded retry/stream-recovery policy only before tool protocol begins.
4. [x] Publish `session.status.retry` with attempt, next retry time, and user-facing reason.
5. [x] Add per-turn/per-drain tool count, inbox backlog, and streamed-output caps as separate configurable guards.

Acceptance:

- a provider that opens a socket but never emits cannot hold a drain forever;
- retry delay is visible and interruptible;
- exhausting the budget leaves a durable partial response and an actionable status.

## Phase R4 — background agents

- [x] Keep agents on the native durable child-Session lifecycle rather than introducing a second `BackgroundJob` execution model.
- [x] Wake a child only after its durable prompt admission and wake eligible unpromoted child inputs at startup without replaying in-flight provider work.
- [x] Require an explicit `spawn` permission assertion and enforce depth plus durable active/rate quotas.
- [x] Make `/sub-agent` self-drive until `exit(result)` and hand the final result back to the parent.
- [x] Make `wait` direct-child-owned, race-safe and event-driven over durable Session state.
- [x] Fold child completion results into every open client Session record.
- [ ] Make quota admission atomic for clustered writers, add configurable quota policy, define parent-stop child propagation and expose explicit cancel/failure lifecycle controls.

## Phase R5 — context parity and integration maturity

Delivered integration hardening:

- [x] Return only a public redacted MCP projection from config HTTP endpoints and exports; preserve stored secrets when the redaction placeholder is written back.
- [x] Remove arbitrary MCP log payloads from server logs.
- [x] Honor server/global startup timeouts with request-timeout compatibility fallback.
- [x] Make the MCP connect endpoint report the actual post-connect status.

Remaining parity and administration work:

- [ ] Apply selected-agent system/request policy and provider-family baseline.
- [ ] Add configured/nested Context Sources, reference alias expansion, local attachment materialization, plugin transforms and structured-output policy.
- [ ] Extend MCP UI/API with persistent edit/remove, status/reload diagnostics and a protected secret-write path. Public config export is intentionally not a secret backup.
- [ ] Extend skills UI with discovery status, validation, preview, reload and per-agent visibility; align slash-command permission handling and retire the legacy CLI config path.

## Validation chain

- Pure reducer/parser tests first.
- Core SessionRunner and projector integration tests from `packages/core`.
- App store-fold and component tests from `packages/app`.
- Package typechecks.
- Migration generation plus `bun run migration --check`.
- App/desktop production build, sidecar prebuild, Linux packaging, artifact inspection and hashes.

The known legacy MCP HttpApi fixture mismatch is tracked separately; MCP lifecycle tests are the runtime gate until that fixture is migrated to the SQLite config-store setup.
