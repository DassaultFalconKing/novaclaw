export * as SessionCommunicator from "./communicator"

import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { SessionInput } from "./input"
import { SessionMessage } from "./message"
import { Prompt } from "./prompt"
import { SessionSchema } from "./schema"
import { SessionSpawnDispatch } from "./spawn-dispatch"
import { SessionStore } from "./store"

export class CommunicationError extends Schema.TaggedErrorClass<CommunicationError>()(
  "SessionCommunicator.Error",
  {
    reason: Schema.Literals(["source_not_found", "target_not_found", "not_related", "target_completed"]),
    sourceID: SessionSchema.ID,
    targetID: SessionSchema.ID,
  },
) {}

export interface Interface {
  readonly send: (input: {
    readonly sourceID: SessionSchema.ID
    readonly targetID: SessionSchema.ID
    readonly text: string
  }) => Effect.Effect<SessionMessage.ID, CommunicationError>
}

export class Service extends Context.Service<Service, Interface>()("@novaclaw/v2/SessionCommunicator") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const store = yield* SessionStore.Service
    const dispatch = yield* SessionSpawnDispatch.Service

    return Service.of({
      send: Effect.fn("SessionCommunicator.send")(function* (input) {
        const source = yield* store.get(input.sourceID)
        if (!source)
          return yield* new CommunicationError({
            reason: "source_not_found",
            sourceID: input.sourceID,
            targetID: input.targetID,
          })
        const target = yield* store.get(input.targetID)
        if (!target)
          return yield* new CommunicationError({
            reason: "target_not_found",
            sourceID: input.sourceID,
            targetID: input.targetID,
          })
        const sourceRole = target.parentID === source.id ? "parent" : source.parentID === target.id ? "child" : undefined
        if (!sourceRole)
          return yield* new CommunicationError({
            reason: "not_related",
            sourceID: input.sourceID,
            targetID: input.targetID,
          })
        if (target.result !== undefined)
          return yield* new CommunicationError({
            reason: "target_completed",
            sourceID: input.sourceID,
            targetID: input.targetID,
          })

        const messageID = SessionMessage.ID.create()
        yield* SessionInput.admit(db, events, {
          id: messageID,
          sessionID: target.id,
          prompt: Prompt.make({
            text:
              `[NovaClaw message from your ${sourceRole} Session ${source.id}; ` +
              `agent-to-agent context, not a new user message.]\n\n${input.text}`,
          }),
          delivery: "steer",
        })
        yield* dispatch.wake(target.id)
        return messageID
      }),
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, SessionStore.node, SessionSpawnDispatch.node],
})
