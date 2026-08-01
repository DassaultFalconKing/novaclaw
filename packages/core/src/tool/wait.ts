export * as WaitTool from "./wait"

import { ToolFailure } from "@novaclaw/llm"
import { Duration, Effect, Layer, Option, Schema, Stream } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { SessionEvent } from "../session/event"
import { SessionStore } from "../session/store"
import { SessionSchema } from "../session/schema"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

// wait(sessionID) — join on a child session's completion (architecture.md step 5), the complement to
// spawn/exit. Polls the child's `result` (set by exit() via the Completed event) until present or a
// timeout. The durable aggregate stream closes the read/subscribe race and survives completion
// before the wait call. A caller may only join its own direct child.

export const name = "wait"
export const Input = Schema.Struct({
  sessionID: Schema.String.annotate({ description: "The child session id to wait for (returned by a prior spawn)." }),
})

const StructuredOutput = Schema.Struct({ completed: Schema.Boolean })
const Output = Schema.Struct({ ...StructuredOutput.fields, message: Schema.String })
type Output = typeof Output.Type

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const store = yield* SessionStore.Service
    const events = yield* EventV2.Service
    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Block until a child session (spawned earlier) completes via exit(), then return its result. " +
            "Times out after ~2 minutes if the child has not completed.",
          input: Input,
          output: Output,
          structured: StructuredOutput,
          toStructuredOutput: ({ output }) => ({ completed: output.completed }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.message }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const childID = SessionSchema.ID.make(input.sessionID)
              const child: SessionSchema.Info | undefined = yield* store.get(childID)
              if (!child)
                return yield* Effect.fail(new ToolFailure({ message: `Unknown child session ${childID}.` }))
              if (child.parentID !== context.sessionID)
                return yield* Effect.fail(
                  new ToolFailure({ message: `Session ${childID} is not a direct child of this Session.` }),
                )
              if (child.result !== undefined) return completedOutput(childID, child.result)
              const completed = yield* events
                .durable({ aggregateID: childID })
                .pipe(
                  Stream.filter((event) => event.type === SessionEvent.Completed.type),
                  Stream.runHead,
                  Effect.orDie,
                  Effect.timeoutOption(Duration.minutes(2)),
                )
              if (Option.isNone(completed) || Option.isNone(completed.value))
                return { completed: false, message: `Timed out waiting for session ${childID}.` }
              const data = completed.value.value.data as { result?: unknown }
              return completedOutput(childID, data.result)
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

const completedOutput = (childID: SessionSchema.ID, value: unknown): Output => ({
  completed: true,
  message: `Session ${childID} completed. Result: ${typeof value === "string" ? value : JSON.stringify(value)}`,
})

export const node = makeLocationNode({
  name: "tool/wait",
  layer,
  deps: [ToolRegistry.node, SessionStore.node, EventV2.node],
})
