export * as FinishRecovery from "./finish-recovery"

import type { FinishReason } from "@novaclaw/llm"

export interface State {
  recoveries: number
}

export type Decision =
  | { readonly kind: "none" }
  | { readonly kind: "continue"; readonly message: string }
  | { readonly kind: "stop"; readonly notice: string }

export const initialState = (): State => ({ recoveries: 0 })

export function decide(reason: FinishReason | undefined, needsContinuation: boolean, state: State): Decision {
  if (reason !== "length" || needsContinuation) return { kind: "none" }
  state.recoveries++
  if (state.recoveries === 1)
    return {
      kind: "continue",
      message:
        "The provider stopped the previous response at its output-token limit. Continue from the exact cutoff " +
        "without repeating completed work. Inspect current files or tool results before continuing, and keep the next action atomic.",
    }
  return {
    kind: "stop",
    notice:
      "Provider output hit the token limit again after one continuation. The run paused to avoid a truncation loop; " +
      "increase the execution/output budget or split the task into smaller steps, then send `resume`.",
  }
}
