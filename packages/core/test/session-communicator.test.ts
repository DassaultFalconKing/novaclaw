import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { Database } from "@novaclaw/core/database/database"
import { AppNodeBuilder } from "@novaclaw/core/effect/app-node-builder"
import { LayerNode } from "@novaclaw/core/effect/layer-node"
import { EventV2 } from "@novaclaw/core/event"
import { Location } from "@novaclaw/core/location"
import { ProjectV2 } from "@novaclaw/core/project"
import { AbsolutePath } from "@novaclaw/core/schema"
import { createSessionRecord } from "@novaclaw/core/session"
import { SessionCommunicator } from "@novaclaw/core/session/communicator"
import { SessionEvent } from "@novaclaw/core/session/event"
import { SessionInput } from "@novaclaw/core/session/input"
import { SessionProjector } from "@novaclaw/core/session/projector"
import { SessionSpawnDispatch } from "@novaclaw/core/session/spawn-dispatch"
import { SessionStore } from "@novaclaw/core/session/store"
import { testEffect } from "./lib/effect"

const wakeCalls: string[] = []
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
  }),
)
const dispatch = Layer.succeed(
  SessionSpawnDispatch.Service,
  SessionSpawnDispatch.Service.of({
    install: () => Effect.void,
    wake: (sessionID) => Effect.sync(() => void wakeCalls.push(sessionID)),
  }),
)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      ProjectV2.node,
      SessionProjector.node,
      SessionStore.node,
      SessionCommunicator.node,
    ]),
    [
      [ProjectV2.node, projects],
      [SessionSpawnDispatch.node, dispatch],
    ],
  ),
)
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

describe("SessionCommunicator", () => {
  it.effect("durably steers a direct child and wakes it", () =>
    Effect.gen(function* () {
      wakeCalls.length = 0
      const { db } = yield* Database.Service
      const events = yield* EventV2.Service
      const projects = yield* ProjectV2.Service
      const store = yield* SessionStore.Service
      const communicator = yield* SessionCommunicator.Service
      const deps = { db, events, projects, store }
      const parent = yield* createSessionRecord(deps, { location })
      const child = yield* createSessionRecord(deps, { location, parentID: parent.id, type: "sub-agent" })

      const messageID = yield* communicator.send({
        sourceID: parent.id,
        targetID: child.id,
        text: "Use the Hound live profile under /tmp, not a persistent scratch folder.",
      })
      const admitted = yield* SessionInput.find(db, messageID)

      expect(admitted).toMatchObject({ sessionID: child.id, delivery: "steer" })
      expect(admitted?.prompt.text).toContain(`from your parent Session ${parent.id}`)
      expect(admitted?.prompt.text).toContain("not a new user message")
      expect(admitted?.prompt.text).toContain("Hound live profile")
      expect(wakeCalls).toEqual([child.id])
    }),
  )

  it.effect("allows a child reply but rejects unrelated and completed targets", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const events = yield* EventV2.Service
      const projects = yield* ProjectV2.Service
      const store = yield* SessionStore.Service
      const communicator = yield* SessionCommunicator.Service
      const deps = { db, events, projects, store }
      const parent = yield* createSessionRecord(deps, { location })
      const child = yield* createSessionRecord(deps, { location, parentID: parent.id, type: "sub-agent" })
      const unrelated = yield* createSessionRecord(deps, { location })

      const replyID = yield* communicator.send({ sourceID: child.id, targetID: parent.id, text: "Found it." })
      expect((yield* SessionInput.find(db, replyID))?.prompt.text).toContain(`from your child Session ${child.id}`)

      const unrelatedError = yield* communicator
        .send({ sourceID: parent.id, targetID: unrelated.id, text: "No." })
        .pipe(Effect.flip)
      expect(unrelatedError.reason).toBe("not_related")

      yield* events.publish(SessionEvent.Completed, {
        sessionID: child.id,
        result: "done",
        timestamp: DateTime.makeUnsafe(Date.now()),
      })
      const completedError = yield* communicator
        .send({ sourceID: parent.id, targetID: child.id, text: "Too late." })
        .pipe(Effect.flip)
      expect(completedError.reason).toBe("target_completed")
    }),
  )
})
