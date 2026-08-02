# Diagnosis — reference whitelist empty (`external_directory` deny)

**Status:** IN PROGRESS — root cause not yet confirmed.
**Start:** 2026-08-02 · package: `packages/novaclaw` / `packages/core`

## Symptom

`test/agent/agent.test.ts` — "project reference directories are allowed for external_directory"
(always fails) and "plan agent denies `external_directory` when references are unset" (fails only in
the combined run, likely a leaking fixture — see `test/permission-task.test.ts:145-200` which writes
`novaclaw.json` without cleanup; isolation pattern: `test/config/config.test.ts:206-255`).

The reference test:

```ts
configIt(
  "project reference directories are allowed for external_directory",
  { references: { docs: "../docs" } },
  () => ... Permission.evaluate("external_directory", path.resolve(process.cwd(), "../docs/reference/notes.md"), build!.permission).action === "allow",
  { git: true },
)
```

`Permission.evaluate` returns `deny` — the whitelist built from `references` is empty.

## Context: Config → SQLite migration

- `references` no longer live in the assembled config. They were moved into
  `ReferenceConfigStore` (SQLite, instance-wide).
- The store is populated by a one-shot seed:
  `ReferenceConfigSeed.seedFromDirectory(globalConfigDir, directory, home)`
  (`packages/core/src/reference-config-seed.ts`).
- The seed reads `config.json` / `novaclaw.json` / `novaclaw.jsonc` from the global config dir and
  the launch directory, then `NOVACLAW_CONFIG_CONTENT` (resolved against the launch directory), and
  writes normalized reference entries via `store.setLayers`. Idempotent: no-op once the store holds
  any alias (`store.isEmpty()` gate).
- The seed is invoked ONLY inside `loadStores` (`packages/novaclaw/src/config/config.ts:324-330`):
  `ConfigSeedStartup.seedAll(...)` + `ConfigStoreWrite.overlay({})`, and `loadStores` is wrapped in
  `Effect.cachedInvalidateWithTTL(..., Duration.infinity)` (config.ts:332-344) — the global document
  is cached forever.
- The agent consumes the store through `Reference.Service.list()` (location context) via the
  `ConfigReferencePlugin` bridge; `agent.ts:175-215` waits for `PluginV2.wait(core/config-reference)`
  and builds the whitelist unconditionally (the old conditional gate was removed — that removal is
  correct; the problem is upstream: the store never gets populated in tests).

## Established facts

1. **`Layer.provide` closes services in** — it does NOT add them to the result context. Reading
   `ReferenceConfigStore.Service` inside a test body fails with `Service not found` unless the test
   layer is built with `Layer.provideMerge(agentLayer(), ReferenceConfigStore.defaultLayer)`.
2. **`Reference.Service` lives in the location context** — unavailable in a plain `it.effect` body.
3. **Debug probe** (`debugIt` = `testEffect(Layer.provideMerge(agentLayer(), ReferenceConfigStore.defaultLayer))`):
   `store.references()` returns `{}` BEFORE and AFTER `load((svc) => svc.get("build"))`;
   `build.permission.rules` is `undefined` (absent from the JSON dump). So the store is empty even
   after a full agent load.
4. **Permissions and references are asymmetric in `loadInstanceState`:**
   `process.env.NOVACLAW_CONFIG_CONTENT` is merged LIVE as a "local" source (config.ts:496-505),
   which is why all permission tests pass through the env channel — while `references` reach the
   agent ONLY through the store (seeded once, then cached forever).
5. **Test harness ordering:** `withTmpdirInstance` boots the instance BEFORE the test body runs;
   `withConfigEnv` sets `NOVACLAW_CONFIG_CONTENT` inside the body. So any config read that happens
   during boot (or on an early `getGlobal`) sees an EMPTY env, and the `Duration.infinity` cache can
   freeze an empty document for the rest of the process.
6. `seedFromDirectory` requires `FSUtil.Service` (`@novaclaw/FileSystem`) — not provided by the
   `debugIt` layer, so the direct seed call in the probe fails there.

## Experiments

| # | What | Result |
|---|---|---|
| 1 | `debugIt.effect("DEBUG store direct")` — store read without instance | Pass; `ref-debug-direct.json` = `{}` (store reachable, empty) |
| 2 | `debugIt.instance("DEBUG reference store state", () => withConfigEnv({references...}, body))` | Pass; `ref-debug.json` = `{ before: {}, after: {} }` — store empty after load |
| 3 | Probe rewrite: env set BEFORE boot (`withTmpdirInstance` + external env set + `ensuring` restore), direct `ReferenceConfigSeed.seedFromDirectory` call mid-body | Blocked by missing services in probe layer: `ChildProcessSpawner` → fixed via `withTmpdirInstance` (provides `CrossSpawnSpawner.defaultLayer`, fixture.ts:206); `acquireUseRelease` 3-arg → replaced with `ensuring`; then `Service not found: @novaclaw/FileSystem` — probe never reached `Bun.write`, no new data |

## Open hypotheses (ranked)

1. **Boot-before-env + forever cache:** the first `getGlobal` (instance boot or plugin bridge) runs
   the seed with an empty `NOVACLAW_CONFIG_CONTENT`; the `Duration.infinity` cache then pins the
   empty document for the process, so the env-content reference test can never populate the store.
   Permissions still pass because their channel (live env merge in `loadInstanceState`) is not
   cached. — UNCONFIRMED (experiment 3 must be repeated with `FSUtil` provided).
2. **Seed never runs on the instance path** (`loadInstanceState` vs `loadStores` divergence).
3. **Different store instances** — if `ReferenceConfigStore.defaultLayer` is not singleton-safe
   inside `provideMerge`, the probe reads a different instance than the one the config layer seeds.
4. **Env-content references fail to decode** in `seedFromDirectory` (jsonc parse / `Config.Info`
   decode of `references`), silently skipped.

## Next steps

1. Add `FSUtil` (or its default layer) to the `debugIt` layer — or wrap the probe in `catchAll`
   that writes the error into the JSON — and rerun experiment 3 (env before boot + direct seed).
   `seeded` must show up in `ref-debug.json`.
2. If `seeded` is non-empty: store instances are shared and the seed works → find who calls
   `getGlobal` during boot and whether `loadInstanceState` consults the store at all
   (hypothesis 2), or check `Layer` identity/memoization (hypothesis 3).
3. If `seeded` stays empty with a healthy env: investigate decode of `references` from
   `NOVACLAW_CONFIG_CONTENT` (hypothesis 4).
4. Cleanup after the fix: remove both DEBUG tests and `debugIt`; fix the leaking fixture in
   `test/permission-task.test.ts` (pattern: `test/config/config.test.ts:206-255`); re-run the pair.
5. Decide `docs/` fixture fate (`docs/reference/notes.md` referenced by the test is absent);
   read `test/cli/run/run-process.test.ts` (user question about run-process).
6. Full package run; commit (exclude `test/agent/probe2.test.ts`); MemPalace diary
   (`wing_novaclaw`).

## Key files

- `packages/novaclaw/test/agent/agent.test.ts` — `debugIt` (provideMerge, lines 31-32); DEBUG tests
  (~597-628, temporary); `configIt` (68-73); reference tests (~565-585, ~630-648).
- `packages/novaclaw/src/config/config.ts:324-344` — `loadStores` / seed call site; `cachedGlobal`
  with `Duration.infinity`; env-content live merge at 496-505.
- `packages/core/src/reference-config-seed.ts` — `seedFromDirectory` (sources, `isEmpty` gate,
  `setLayers`).
- `packages/core/src/reference-config-store.ts` — `layer`/`defaultLayer`.
- `packages/core/src/config-seed-startup.ts` — `seedAll` (calls reference seed among 7 seeds).
- `packages/core/src/config/plugin/reference.ts` — store→`Reference.Service` bridge (transform).
- `packages/novaclaw/src/agent/agent.ts:175-215` — unconditional wait + whitelist build.
- `/tmp/opencode/ref-debug.json` / `ref-debug-direct.json` — probe dumps.

## Lint status

`bun run lint` (oxlint, root): 0 errors, 2965 warnings — all pre-existing (desktop/app packages);
the touched test file: 24 warnings, none on the debug/test lines added during this diagnosis.
