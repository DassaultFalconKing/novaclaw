export * as SessionSpawnDispatch from "./spawn-dispatch"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { SessionSchema } from "./schema"

/**
 * Cycle-free handoff from a Location-scoped spawner to the process-global Session coordinator.
 * SessionV2 installs the coordinator callback after LocationServiceMap is built; spawners only
 * depend on this inert registry and never reach back through SessionV2 or SessionExecution.
 */
export interface Interface {
  readonly install: (handler: (sessionID: SessionSchema.ID) => Effect.Effect<void>) => Effect.Effect<void>
  readonly wake: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@novaclaw/v2/SessionSpawnDispatch") {}

export const layer = Layer.sync(Service, () => {
  let handler = (_sessionID: SessionSchema.ID): Effect.Effect<void> => Effect.void
  return Service.of({
    install: (next) => Effect.sync(() => void (handler = next)),
    wake: (sessionID) => Effect.suspend(() => handler(sessionID)),
  })
})

export const defaultLayer = layer
export const node = makeGlobalNode({ service: Service, layer, deps: [] })
