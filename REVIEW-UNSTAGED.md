## Code Review — Unstaged Changes (2026-08-02)

15 unstaged files. Overall: Config→SQLite migration (agent/permission tests), trace debug hooks, TODO cleanup.

### Green (safe to commit)

| File | Verdict |
|---|---|
| `.gitignore` | +`mempalace.yaml`, `entities.json` — mempalace per-project files excluded from repo. Fine. |
| `packages/core/src/file-mutation.ts` | Removed "snapshots / undo" TODO — feature deprioritized or done elsewhere. OK. |
| `packages/core/src/tool/bash.ts` | Removed 3 TODOs (PowerShell, background job status, model-facing launch). Cancelled features. OK. |
| `packages/core/src/tool/edit.ts` | Removed "snapshots / undo" TODO. Same as file-mutation. OK. |
| `packages/core/src/tool/spawn.ts` | Removed "exit + wait" TODO. Lifecycle completed. OK. |
| `packages/core/src/tool/write.ts` | Removed "snapshots / undo" TODO. Same. OK. |
| `packages/novaclaw/src/agent/agent.ts` | **Bugfix.** Config→SQLite: `cfg.references` no longer in assembled config (moved to ReferenceConfigStore). Removed conditional gate that made referenceDirs dead code. Now runs unconditionally. Correct. |
| `packages/novaclaw/src/cli/cmd/run.ts` | Trace hooks under `NOVACLAW_RUN_TRACE` (file append, timestamped). Also `process.env.PWD ?? process.cwd()` → `process.cwd()`. Trace is debug-only, safe. |
| `packages/novaclaw/src/event-v2-bridge.ts` | Trace hook for bridge events under `NOVACLAW_RUN_TRACE`. Debug-only. |
| `packages/novaclaw/src/plugin/index.ts` | Simplified `Effect.catch(() => Effect.void)` — removed commented-out error event code. Dead code cleanup. |
| `packages/novaclaw/src/server/routes/instance/httpapi/handlers/event.ts` | Trace hook in SSE event filter under `NOVACLAW_RUN_TRACE`. Debug-only. |
| `packages/novaclaw/test/agent/agent.test.ts` | **Config→SQLite migration.** New `configIt` helper passes config via `NOVACLAW_CONFIG_CONTENT` env var (old `config:` option writes dead file). New `debugIt` for ReferenceConfigStore. Reference dir test fixed to use `process.cwd()`. 2 debug tests added (temp). Core of the migration. |
| `packages/novaclaw/test/permission-task.test.ts` | **Config→SQLite migration.** New `writeManagedConfig()` writes to managed config dir instead of using `config:` option. 6 tests migrated. Correct. |

### Yellow (review needed)

| File | Issue |
|---|---|
| `bun.lock` | Desktop version bump `0.1.0 → 0.1.1`. Intentional? If not, revert the lock change. |
| `packages/novaclaw/src/server/routes/instance/httpapi/handlers/provider.ts` | **Reverts** commit `df085e6` (provider catalog cache + watcher timeout). Removed `Clock/Duration/Ref` imports and `CATALOG_CACHE_TTL_MS`. If catalog caching was needed, this is a regression. Needs explanation. |

### Summary

- 13 files: commit as-is, no issues.
- `provider.ts`: needs decision — revert or keep reverted? Catalog cache was 30s TTL, not critical but nice-to-have.
- `bun.lock`: confirm version bump is intentional.
