export * as SendTool from "./send"

import { ToolFailure } from "@novaclaw/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { PermissionV2 } from "../permission"
import { SessionCommunicator } from "../session/communicator"
import { SessionSchema } from "../session/schema"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "send"

export const Input = Schema.Struct({
  sessionID: Schema.String.annotate({ description: "The direct parent or child session id." }),
  message: Schema.String.annotate({
    description: "The follow-up message to deliver durably to that session.",
  }),
})

const StructuredOutput = Schema.Struct({ delivered: Schema.Boolean, sessionID: Schema.String })
const Output = Schema.Struct({ ...StructuredOutput.fields, message: Schema.String })
type Output = typeof Output.Type

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const communicator = yield* SessionCommunicator.Service
    const permission = yield* PermissionV2.Service
    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Send a durable follow-up message to this session's direct parent or child. The target is woken " +
            "immediately; use wait(childID) when you need the child's final exit result.",
          input: Input,
          output: Output,
          structured: StructuredOutput,
          toStructuredOutput: ({ output }) => ({ delivered: output.delivered, sessionID: output.sessionID }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.message }],
          execute: (input, context) => {
            const targetID = SessionSchema.ID.make(input.sessionID)
            if (!input.message.trim()) return Effect.fail(new ToolFailure({ message: "Message cannot be empty." }))
            return permission
              .assert({
                sessionID: context.sessionID,
                agent: context.agent,
                action: "spawn",
                resources: [targetID],
                source: {
                  type: "tool",
                  messageID: context.assistantMessageID,
                  callID: context.toolCallID,
                },
              })
              .pipe(
                Effect.andThen(
                  communicator.send({ sourceID: context.sessionID, targetID, text: input.message }),
                ),
                Effect.as({
                  delivered: true,
                  sessionID: targetID,
                  message: `Delivered a follow-up message to session ${targetID}.`,
                } satisfies Output),
                Effect.mapError((error) =>
                  error._tag === "SessionCommunicator.Error"
                    ? error
                    : new ToolFailure({ message: `Unable to message session ${targetID}.` }),
                ),
                Effect.catchTag("SessionCommunicator.Error", (error) =>
                  Effect.fail(
                    new ToolFailure({
                      message: {
                        source_not_found: "The current Session no longer exists.",
                        target_not_found: `Unknown session ${targetID}.`,
                        not_related: `Session ${targetID} is not this Session's direct parent or child.`,
                        target_completed: `Session ${targetID} has already completed; its transcript is immutable.`,
                      }[error.reason],
                    }),
                  ),
                ),
              )
          },
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/send",
  layer,
  deps: [ToolRegistry.node, SessionCommunicator.node, PermissionV2.node],
})
