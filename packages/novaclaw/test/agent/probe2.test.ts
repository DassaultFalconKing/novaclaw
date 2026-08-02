import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { afterEach } from "bun:test"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@novaclaw/core/global"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Reference } from "@novaclaw/core/reference"
import { ReferenceConfigStore } from "@novaclaw/core/reference-config-store"
import { PluginV2 } from "@novaclaw/core/plugin"
import { Location } from "@novaclaw/core/location"
import { AbsolutePath } from "@novaclaw/core/schema"
import { Skill } from "../../src/skill"
import { LocationServiceMap, locationServiceMapLayer } from "@novaclaw/core/location-services"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Agent.layer.pipe(
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Skill.defaultLayer),
    Layer.provide(locationServiceMapLayer),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const it = testEffect(agentLayer())

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("PROBE dump external_directory rules", () =>
  Effect.gen(function* () {
    const previous = process.env.NOVACLAW_CONFIG_CONTENT
    process.env.NOVACLAW_CONFIG_CONTENT = JSON.stringify({ references: { docs: "../docs" } })
    try {
      const build = yield* Agent.Service.use((svc) => svc.get("build"))
      const pluginV2 = yield* PluginV2.Service
      yield* pluginV2.wait(PluginV2.ID.make("core/config-reference"))
      const locations = yield* LocationServiceMap.Service
      const refs = yield* Reference.Service.list().pipe(
        Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(process.cwd()) }))),
      )
      console.log("PROBE refs for cwd:", JSON.stringify(refs.map((r) => ({ name: r.name, path: r.path }))))
      const rules = build!.permission.filter((r) => r.permission === "external_directory")
      const cwd = process.cwd()
      console.log("PROBE cwd:", cwd)
      console.log("PROBE external_directory rules:", JSON.stringify(rules, null, 2))
      const target = path.resolve(cwd, "../docs/reference/notes.md")
      console.log("PROBE target:", target)
      expect(Permission.evaluate("external_directory", target, build!.permission).action).toBe("ask")
      void TestInstance
    } finally {
      if (previous === undefined) delete process.env.NOVACLAW_CONFIG_CONTENT
      else process.env.NOVACLAW_CONFIG_CONTENT = previous
    }
  }),
)
