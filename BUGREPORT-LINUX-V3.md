# NovaClaw Linux V3 bug report

Date: 2026-07-28

Environment:

- CachyOS, Linux x86_64
- Bun 1.3.14
- Electron 42.3.3
- NovaClaw 0.1.0
- Branch `build-linux-V3`
- Upstream base `origin/main` at `06c069b`

## Executive summary

The Linux V3 line builds and opens successfully. The standalone CLI and packaged
Electron application pass startup smoke tests. A live local model received the
tool registry, used `todowrite`, `bash`, and `read`, continued across five
provider turns, completed the task, and stopped normally.

Three product defects found during integration are fixed in this branch. One
low-severity offline-mode logging defect remains. Two failing Playwright areas
are test-harness migration work, not confirmed product regressions.

## Fixed product defects

### NC-LNX-V3-001 — Settings and thinking selectors do not open

Severity: High

Status: Fixed in `2f70afe`

Symptoms:

- Settings controls that use the common Select component do nothing.
- The thinking-level control does not open.
- The local model configuration surface appears unavailable even though its
  route and fields exist.

Cause:

The common Select component always passed `optionGroupChildren="options"` and
always wrapped options as groups. For a Select without `groupBy`, Kobalte treated
the ordinary options as an empty grouped collection.

Fix:

Pass ordinary options directly and omit `optionGroupChildren` unless `groupBy`
is present.

Verification:

- Settings opens.
- The local OpenAI-compatible endpoint field is visible.
- The thinking-level selector opens.
- All registered application pages and launcher links pass the interface smoke.

### NC-LNX-V3-002 — Completion recovery can manufacture an extra turn

Severity: High

Status: Fixed in `11b4581`

Symptoms:

The recovery layer could interpret ambiguous terminal state as a dropped tool
call and start another provider turn. Risk cases included:

- a provider failure,
- no assistant message created,
- reasoning-only output,
- pending user input,
- recovery based on an older assistant message.

Cause:

Empty-turn and finish recovery were not tied tightly enough to the exact
assistant message and clean terminal event from the current provider turn.

Fix:

- Carry the current assistant message ID out of the publisher.
- Require an explicit clean `finish: stop`.
- Suppress recovery after provider errors.
- Treat non-empty reasoning as output.
- Suppress empty recovery when user input is pending.
- Evaluate emptiness only against the exact current assistant message.
- Keep one bounded retry for a genuinely empty clean stop, then publish a
  diagnostic instead of looping.

Verification:

- Core: 2223/2223 tests.
- New negative cases cover provider errors, missing assistant starts, and
  reasoning-only output.
- Live local-model smoke completed five provider turns, used three tools, and
  ended with `finish: stop`.

### NC-LNX-V3-003 — Stored Windows paths are rejected on a Linux host

Severity: Medium

Status: Fixed in `3b20545`

Symptoms:

Windows drive paths and UNC paths can be read as relative or invalid when a
database or shared state is inspected from Linux. Shell detection can also parse
a Windows Bash path with POSIX rules.

Cause:

Absolute-path validation and shell-name parsing used the current host platform
instead of recognizing portable stored paths or the target platform.

Fix:

- Recognize drive-absolute and UNC paths independently of the current OS.
- Normalize Windows separators for storage.
- Continue to reject `C:relative` and root-relative `\path`.
- Parse the configured shell with `path.win32` or `path.posix` according to the
  target platform.

Verification:

- XDG path tests: 24/24.
- Strict runner tests: 35/35.
- Session path regression tests pass.
- Core typecheck passes.

## Open product defect

### NC-LNX-V3-004 — Offline startup logs a provider subscription timeout

Severity: Low

Status: Open

Symptoms:

With `NOVACLAW_OFFLINE=1`, the packaged application opens and its sidecar reaches
ready, but the runtime later logs:

```text
failed to subscribe ... TimeoutError
```

Impact:

- Startup is not blocked.
- The renderer remains open.
- SQLite and the memory graph initialize.
- The error is misleading in an intentional air-gapped run.

Expected:

Offline mode should avoid the provider subscription that requires unavailable
network/catalog state, or record an explicit informational offline skip.

Actual:

The subscription waits for its timeout and logs an error.

Evidence:

`/tmp/novaclaw-v3-smoke.DzlZMj/novaclaw/data/log/novaclaw.log`

Recommended port:

Gate the provider subscription on the resolved offline policy. If the
subscription is still required for local providers, distinguish a local-only
empty catalog from a network timeout and avoid error severity for the expected
offline case.

## Test-harness defects

### NC-E2E-V3-001 — Explicit server route remains at Loading in Todo test

Severity: Test blocker

Status: Pending maintainer cross-server harness

Scenario:

`session-todo-dock-navigation.spec.ts` enters through `/server/.../session/...`.
The current mock never completes server-scope bootstrap, and the page remains at
`Loading...` before Todo behavior is exercised.

The maintainer-owned
`packages/app/e2e/regression/cross-server-tab-close.spec.ts` is unchanged from
`origin/main`. Do not add a compatibility workaround before the replacement
cross-server test arrives.

### NC-E2E-V3-002 — Timeline tests still use removed V1 transcript contracts

Severity: Test debt

Status: Open

Affected areas:

- `session-timeline-collapse-state.spec.ts`
- `session-timeline-context-resize.spec.ts`
- `session-timeline.spec.ts`

The fixtures return V1 `{ info, parts }` records and the assertions target the
removed V1 virtualized DOM. The product now renders native V2
`SessionMessage[]` through `NativeTimeline` and `NativeTranscript`.

Recommended port:

- Replace fixtures with native V2 messages.
- Replace `message.part.updated` events with `session.next.*` events.
- Assert native transcript semantics and selectors.
- Do not restore the legacy virtualized DOM only to satisfy obsolete tests.

## Non-defects and expected warnings

- Electron Builder reports optional native packages for other operating systems
  and CPU architectures as missing. The packaged AppImage contains the required
  Linux x64 `node-pty`, `msgpackr-extract`, and Parcel watcher payloads.
- Wayland color-management warnings are Chromium/driver diagnostics and did not
  block rendering.
- Network-service and renderer termination messages in the smoke log occurred
  only after the test timer sent `SIGTERM`.
- No `kb-memory failed to open` message occurred.

## Related validation

Full build results, artifact checksums, chunk sizes, log paths, and launch
commands are in `BUILD-LINUX-V3-REPORT.md`.
