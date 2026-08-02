import { afterEach, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "path"
import { disposeAllInstances, TestInstance, withTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@novaclaw/core/global"
import { ConfigSeedStartup } from "@novaclaw/core/config-seed-startup"
import { ReferenceConfigSeed } from "@novaclaw/core/reference-config-seed"
import { Permission } from "../../src/permission"
import { PermissionRuleset } from "@novaclaw/schema/permission-ruleset"
import { Plugin } from "../../src/plugin"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"
import { LocationServiceMap, locationServiceMapLayer } from "@novaclaw/core/location-services"
import { Reference } from "@novaclaw/core/reference"
import { ReferenceConfigStore } from "@novaclaw/core/reference-config-store"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Agent.layer.pipe(
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Skill.defaultLayer),
    Layer.provide(locationServiceMapLayer),
    Layer.provide(ReferenceConfigStore.defaultLayer),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const it = testEffect(agentLayer())
const debugIt = testEffect(Layer.provideMerge(agentLayer(), ReferenceConfigStore.defaultLayer))

// Helper to evaluate permission for a tool with wildcard pattern
function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionRuleset.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

const expectDefaultAgentError = Effect.fn("AgentTest.expectDefaultAgentError")(function* (message: string) {
  const exit = yield* load((svc) => svc.defaultAgent()).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(message)
})

// Config→SQLite step 9: a project novaclaw.json is no longer a runtime config source (jsonc files
// are import/export wire format only; the stores are the source). The fixture `config:` option
// writes exactly that dead file, so config-dependent tests deliver config through the live
// NOVACLAW_CONFIG_CONTENT channel instead — read per instance-state at load, merged as "local".
const withConfigEnv = <A, E, R>(config: unknown, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.NOVACLAW_CONFIG_CONTENT
      process.env.NOVACLAW_CONFIG_CONTENT = JSON.stringify(config)
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.NOVACLAW_CONFIG_CONTENT
        else process.env.NOVACLAW_CONFIG_CONTENT = previous
      }),
  )

const configIt = (
  name: string,
  config: object,
  body: () => Effect.Effect<unknown>,
  options?: Parameters<typeof it.instance>[2],
) => it.instance(name, () => withConfigEnv(config, body()), options)

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("returns default native agents when no config", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    const names = agents.map((a) => a.name)
    expect(names).toContain("build")
    expect(names).toContain("plan")
    expect(names).toContain("general")
    expect(names).toContain("explore")
    expect(names).toContain("compaction")
    expect(names).toContain("title")
    expect(names).toContain("summary")
  }),
)

it.instance("build agent has correct default properties", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(build).toBeDefined()
    expect(build?.mode).toBe("primary")
    expect(build?.native).toBe(true)
    expect(evalPerm(build, "edit")).toBe("allow")
    expect(evalPerm(build, "bash")).toBe("allow")
  }),
)

it.instance("plan agent denies edits except .novaclaw/plans/*", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    expect(plan).toBeDefined()
    // Wildcard is denied
    expect(evalPerm(plan, "edit")).toBe("deny")
    // But specific path is allowed
    expect(Permission.evaluate("edit", ".novaclaw/plans/foo.md", plan!.permission).action).toBe("allow")
  }),
)

it.instance("plan agent denies the general subagent by default", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    expect(plan).toBeDefined()
    expect(Permission.evaluate("task", "general", plan!.permission).action).toBe("deny")
    expect(Permission.evaluate("task", "explore", plan!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "custom", plan!.permission).action).toBe("allow")
  }),
)

configIt(
  "user permission can allow the general subagent from plan mode",
  {
    permissions: [{ action: "task", resource: "general", effect: "allow" }],
  },
  () =>
    Effect.gen(function* () {
      const plan = yield* load((svc) => svc.get("plan"))
      expect(plan).toBeDefined()
      expect(Permission.evaluate("task", "general", plan!.permission).action).toBe("allow")
    }),
)

it.instance("explore agent denies edit and write", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(explore?.mode).toBe("subagent")
    expect(evalPerm(explore, "edit")).toBe("deny")
    expect(evalPerm(explore, "write")).toBe("deny")
    expect(evalPerm(explore, "todowrite")).toBe("deny")
  }),
)

it.instance("explore agent asks for external directories and allows whitelisted external paths", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(Permission.evaluate("external_directory", "/some/other/path", explore!.permission).action).toBe("ask")
    expect(Permission.evaluate("external_directory", Truncate.GLOB, explore!.permission).action).toBe("allow")
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "agent-work"), explore!.permission).action,
    ).toBe("allow")
  }),
)

configIt(
  "reference config does not create subagents",
  {
    references: {
      effect: "github.com/effect/effect-smol",
      effectFull: {
        repository: "Effect-TS/effect",
        branch: "main",
      },
      localdocs: "../docs",
      localdocsFull: {
        path: "../local-docs",
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((agent) => agent.name)
      expect(names).not.toContain("effect")
      expect(names).not.toContain("effectFull")
      expect(names).not.toContain("localdocs")
      expect(names).not.toContain("localdocsFull")
    }),
)

it.instance("general agent denies todo tools", () =>
  Effect.gen(function* () {
    const general = yield* load((svc) => svc.get("general"))
    expect(general).toBeDefined()
    expect(general?.mode).toBe("subagent")
    expect(general?.hidden).toBeUndefined()
    expect(evalPerm(general, "todowrite")).toBe("deny")
  }),
)

it.instance("compaction agent denies all permissions", () =>
  Effect.gen(function* () {
    const compaction = yield* load((svc) => svc.get("compaction"))
    expect(compaction).toBeDefined()
    expect(compaction?.hidden).toBe(true)
    expect(evalPerm(compaction, "bash")).toBe("deny")
    expect(evalPerm(compaction, "edit")).toBe("deny")
    expect(evalPerm(compaction, "read")).toBe("deny")
  }),
)

configIt(
  "custom agent from config creates new agent",
  {
    agents: {
      my_custom_agent: {
        model: "openai/gpt-4",
        description: "My custom agent",
        request: { body: { temperature: 0.5, top_p: 0.9 } },
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const custom = yield* load((svc) => svc.get("my_custom_agent"))
      expect(custom).toBeDefined()
      expect(String(custom?.model?.providerID)).toBe("openai")
      expect(String(custom?.model?.modelID)).toBe("gpt-4")
      expect(custom?.description).toBe("My custom agent")
      expect(custom?.temperature).toBe(0.5)
      expect(custom?.topP).toBe(0.9)
      expect(custom?.native).toBe(false)
      expect(custom?.mode).toBe("all")
    }),
)

configIt(
  "custom agent config overrides native agent properties",
  {
    agents: {
      build: {
        model: "anthropic/claude-3",
        description: "Custom build agent",
        request: { body: { temperature: 0.7 } },
        color: "#FF0000",
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      expect(String(build?.model?.providerID)).toBe("anthropic")
      expect(String(build?.model?.modelID)).toBe("claude-3")
      expect(build?.description).toBe("Custom build agent")
      expect(build?.temperature).toBe(0.7)
      expect(build?.color).toBe("#FF0000")
      expect(build?.native).toBe(true)
    }),
)

configIt(
  "agent disable removes agent from list",
  {
    agents: {
      explore: { disabled: true },
    },
  },
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore).toBeUndefined()
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((a) => a.name)
      expect(names).not.toContain("explore")
    }),
)

configIt(
  "agent permission config merges with defaults",
  {
    agents: {
      build: {
        permissions: [{ action: "bash", resource: "rm -rf *", effect: "deny" }],
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      // Specific pattern is denied
      expect(Permission.evaluate("bash", "rm -rf *", build!.permission).action).toBe("deny")
      // Edit still allowed
      expect(evalPerm(build, "edit")).toBe("allow")
    }),
)

configIt(
  "global permission config applies to all agents",
  {
    permissions: [{ action: "bash", resource: "*", effect: "deny" }],
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      expect(evalPerm(build, "bash")).toBe("deny")
    }),
)

configIt(
  "agent steps/maxSteps config sets steps property",
  {
    agents: {
      build: { steps: 50 },
      plan: { steps: 100 },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      const plan = yield* load((svc) => svc.get("plan"))
      expect(build?.steps).toBe(50)
      expect(plan?.steps).toBe(100)
    }),
)

configIt(
  "agent mode can be overridden",
  {
    agents: {
      explore: { mode: "primary" },
    },
  },
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore?.mode).toBe("primary")
    }),
)

configIt(
  "agent prompt can be set from config",
  {
    agents: {
      build: { system: "Custom system prompt" },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.prompt).toBe("Custom system prompt")
    }),
)

configIt(
  "unknown agent properties are placed into options",
  {
    agents: {
      build: {
        request: { body: { random_property: "hello", another_random: 123 } },
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.options.random_property).toBe("hello")
      expect(build?.options.another_random).toBe(123)
    }),
)

configIt(
  "agent options merge correctly",
  {
    agents: {
      build: {
        request: { body: { custom_option: true, another_option: "value" } },
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.options.custom_option).toBe(true)
      expect(build?.options.another_option).toBe("value")
    }),
)

configIt(
  "multiple custom agents can be defined",
  {
    agents: {
      agent_a: {
        description: "Agent A",
        mode: "subagent",
      },
      agent_b: {
        description: "Agent B",
        mode: "primary",
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const agentA = yield* load((svc) => svc.get("agent_a"))
      const agentB = yield* load((svc) => svc.get("agent_b"))
      expect(agentA?.description).toBe("Agent A")
      expect(agentA?.mode).toBe("subagent")
      expect(agentB?.description).toBe("Agent B")
      expect(agentB?.mode).toBe("primary")
    }),
)

configIt(
  "Agent.list keeps the default agent first and sorts the rest by name",
  {
    default_agent: "plan",
    agents: {
      zebra: {
        description: "Zebra",
        mode: "subagent",
      },
      alpha: {
        description: "Alpha",
        mode: "subagent",
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const names = (yield* load((svc) => svc.list())).map((a) => a.name)
      expect(names[0]).toBe("plan")
      expect(names.slice(1)).toEqual(names.slice(1).toSorted((a, b) => a.localeCompare(b)))
    }),
)

it.instance("Agent.get returns undefined for non-existent agent", () =>
  Effect.gen(function* () {
    const nonExistent = yield* load((svc) => svc.get("does_not_exist"))
    expect(nonExistent).toBeUndefined()
  }),
)

it.instance("default permission includes doom_loop and external_directory as ask", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(evalPerm(build, "doom_loop")).toBe("ask")
    expect(evalPerm(build, "external_directory")).toBe("ask")
  }),
)

it.instance("webfetch is allowed by default", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(evalPerm(build, "webfetch")).toBe("allow")
  }),
)

configIt(
  "legacy tools config converts to permissions",
  {
    agents: {
      build: {
        permissions: [
          { action: "bash", resource: "*", effect: "deny" },
          { action: "read", resource: "*", effect: "deny" },
        ],
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(evalPerm(build, "bash")).toBe("deny")
      expect(evalPerm(build, "read")).toBe("deny")
    }),
)

configIt(
  "legacy tools config maps write/edit/patch to edit permission",
  {
    agents: {
      build: {
        permissions: [{ action: "edit", resource: "*", effect: "deny" }],
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(evalPerm(build, "edit")).toBe("deny")
    }),
)

configIt(
  "Truncate.GLOB is allowed even when user denies external_directory globally",
  {
    permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("deny")
    }),
)

it.instance("global tmp directory children are allowed for external_directory", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "scratch"), build!.permission).action,
    ).toBe("allow")
    expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("ask")
  }),
)

configIt(
  "Truncate.GLOB is allowed even when user denies external_directory per-agent",
  {
    agents: {
      build: {
        permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("deny")
    }),
)

configIt(
  "explicit Truncate.GLOB deny is respected",
  {
    permissions: [
      { action: "external_directory", resource: "*", effect: "deny" },
      { action: "external_directory", resource: Truncate.GLOB, effect: "deny" },
    ],
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
    }),
)

it.instance(
  "skill directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const skillDir = path.join(test.directory, ".novaclaw", "skill", "perm-skill")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: perm-skill
description: Permission skill.
---

# Permission Skill
`,
        ),
      )

      const home = process.env.NOVACLAW_TEST_HOME
      process.env.NOVACLAW_TEST_HOME = test.directory
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.NOVACLAW_TEST_HOME = home
        }),
      )

      const build = yield* load((svc) => svc.get("build"))
      const target = path.join(skillDir, "reference", "notes.md")
      expect(Permission.evaluate("external_directory", target, build!.permission).action).toBe("allow")
    }),
  { git: true },
)

debugIt.effect(
  "DEBUG store direct",
  () =>
    Effect.gen(function* () {
      const store = yield* ReferenceConfigStore.Service
      const refs = yield* store.references()
      yield* Effect.promise(() => Bun.write("/tmp/opencode/ref-debug-direct.json", JSON.stringify(refs, null, 2)))
    }),
  { timeout: 30000 },
)

debugIt.effect(
  "DEBUG reference store state",
  Effect.gen(function* () {
    const prev = process.env.NOVACLAW_CONFIG_CONTENT
    process.env.NOVACLAW_CONFIG_CONTENT = JSON.stringify({ references: { docs: "../docs" } })
    yield* withTmpdirInstance({ git: true })(
      Effect.gen(function* () {
        const store = yield* ReferenceConfigStore.Service
        const before = yield* store.references()
        yield* ReferenceConfigSeed.seedFromDirectory(Global.Path.config, process.cwd(), Global.Path.home)
        const seeded = yield* store.references()
        const build = yield* load((svc) => svc.get("build"))
        const after = yield* store.references()
        yield* Effect.promise(() =>
          Bun.write(
            "/tmp/opencode/ref-debug.json",
            JSON.stringify(
              {
                before,
                seeded,
                after,
                rules: build?.permission.rules,
                permission: build?.permission,
              },
              null,
              2,
            ),
          )
        )
      }),
    ).pipe(Effect.ensuring(Effect.sync(() => (process.env.NOVACLAW_CONFIG_CONTENT = prev))))
  }),
)

configIt(
  "project reference directories are allowed for external_directory",
  {
    references: {
      docs: "../docs",
    },
  },
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      // ReferenceConfigSeed resolves env-content entries against the LAUNCH directory
      // (process.cwd()), not the temp instance dir — the store is instance-wide.
      const target = path.resolve(process.cwd(), "../docs/reference/notes.md")
      expect(Permission.evaluate("external_directory", target, build!.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance("defaultAgent returns build when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultAgent())
    expect(agent).toBe("build")
  }),
)

it.instance("defaultInfo returns resolved build agent when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultInfo())
    expect(agent.name).toBe("build")
    expect(agent.mode).toBe("primary")
  }),
)

configIt(
  "defaultAgent respects default_agent config set to plan",
  {
    default_agent: "plan",
  },
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("plan")
    }),
)

configIt(
  "defaultAgent respects default_agent config set to custom agent with mode all",
  {
    default_agent: "my_custom",
    agents: {
      my_custom: {
        description: "My custom agent",
      },
    },
  },
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("my_custom")
    }),
)

configIt(
  "defaultAgent throws when default_agent points to subagent",
  {
    default_agent: "explore",
  },
  () => expectDefaultAgentError('default agent "explore" is a subagent'),
)

configIt(
  "defaultAgent throws when default_agent points to hidden agent",
  {
    default_agent: "compaction",
  },
  () => expectDefaultAgentError('default agent "compaction" is hidden'),
)

configIt(
  "defaultAgent throws when default_agent points to non-existent agent",
  {
    default_agent: "does_not_exist",
  },
  () => expectDefaultAgentError('default agent "does_not_exist" not found'),
)

configIt(
  "defaultAgent returns plan when build is disabled and default_agent not set",
  {
    agents: {
      build: { disabled: true },
    },
  },
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      // build is disabled, so it should return plan (next primary agent)
      expect(agent).toBe("plan")
    }),
)

configIt(
  "defaultAgent throws when all primary agents are disabled",
  {
    agents: {
      build: { disabled: true },
      plan: { disabled: true },
    },
  },
  () => expectDefaultAgentError("no primary visible agent found"),
)
