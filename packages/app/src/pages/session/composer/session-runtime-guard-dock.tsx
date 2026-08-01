import { ButtonV2 } from "@novaclaw/ui/v2/button-v2"
import { Show, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"

type GuardStatus = {
  type: "paused"
  reason: "tool_calls_turn" | "tool_calls_drain" | "streamed_output" | "inbox_backlog"
  message: string
  limit: number
  observed: number
}

export function SessionRuntimeGuardDock(props: { sessionID: string; status: GuardStatus }) {
  const language = useLanguage()
  const sdk = useSDK()
  const [submitting, setSubmitting] = createSignal(false)
  const canResume = () => props.status.reason !== "inbox_backlog"

  async function resume() {
    if (submitting() || !canResume()) return
    setSubmitting(true)
    try {
      await sdk().client.v2.session.prompt({ sessionID: props.sessionID, prompt: { text: "resume" } })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("session.runtimeGuard.error"),
        description: error instanceof Error ? error.message : String(error),
      })
      setSubmitting(false)
    }
  }

  return (
    <div class="w-full px-3 pt-2">
      <div class="md:max-w-200 md:mx-auto 2xl:max-w-[1000px] rounded-[10px] border border-warning-base/40 bg-warning-base/10 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="text-13-medium text-text-strong">{language.t("session.runtimeGuard.title")}</div>
          <div class="text-12-regular text-text-weak">{props.status.message}</div>
          <Show when={!canResume()}>
            <div class="text-12-regular text-text-weak">{language.t("session.runtimeGuard.inbox")}</div>
          </Show>
        </div>
        <Show when={canResume()}>
          <ButtonV2 size="small" variant="neutral" disabled={submitting()} onClick={() => void resume()}>
            {submitting() ? language.t("session.runtimeGuard.resuming") : language.t("session.runtimeGuard.resume")}
          </ButtonV2>
        </Show>
      </div>
    </div>
  )
}
