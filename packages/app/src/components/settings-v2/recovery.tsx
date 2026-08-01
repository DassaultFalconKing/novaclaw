import { Component, createSignal, onCleanup } from "solid-js"
import { ButtonV2 } from "@novaclaw/ui/v2/button-v2"
import { Switch } from "@novaclaw/ui/v2/switch-v2"
import { TextInputV2 } from "@novaclaw/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { removePersisted } from "@/utils/persist"
import { HELP_SEEN_KEY } from "@/pages/home-screen/help-tour"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

// The UI-preference surface, and ONLY that. localStorage is the app's whole persistence backend on
// web (servers, drafts, prompt history all live there — see utils/persist.ts), so a blanket
// localStorage.clear() would be a partial factory reset, not a preference reset; and on desktop the
// real stores are file-backed behind platform.storage, which localStorage.clear() can't touch at all.
// Curate instead: the "settings.v3" store (view options, layout, fonts, notifications, sounds) via
// removePersisted (routes correctly on BOTH platforms), plus the raw-localStorage theme keys
// (@novaclaw/ui theme/context STORAGE_KEYS) and the first-run tour flag.
const UI_PREF_TARGETS = [{ key: "settings.v3" }]
const UI_PREF_RAW_KEYS = [
  HELP_SEEN_KEY,
  "novaclaw.home.order", // home-screen ORDER_KEY — drag-reorder arrangement is a UI pref, so reset it too (L6)
  "novaclaw-app-theme", // color-scheme preset mirror (uix.md §7)
  "novaclaw-theme-id",
  "novaclaw-color-scheme",
  "novaclaw-theme-css-light",
  "novaclaw-theme-css-dark",
]

interface ProviderWatchdogConfig {
  enabled?: boolean
  inactivityMs?: number
  absoluteMs?: number
}

interface RuntimeGuardsConfig {
  enabled?: boolean
  maxToolCallsPerTurn?: number
  maxToolCallsPerDrain?: number
  maxInboxBacklog?: number
  maxStreamedOutputBytes?: number
}

// The Recovery tab — the vision's third settings pillar (bootstrap · manage · RESET). Three rungs of
// "get me back to a good state", weakest to strongest:
//   1. Reset UI preferences — live today (see the curated list above; chats/servers/drafts untouched).
//   2. Snapshots — restore-to-a-date (pairs with the dated Trash). Server-side; surfaced as coming soon.
//   3. Factory reset — erase chats/sessions/config on this device. Server-side; surfaced as coming soon.
// The coming-soon rows are shown (disabled) rather than hidden: the surface documents the safety model
// so users know deletions are recoverable BEFORE they need it.
export const SettingsRecoveryV2: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSync = useServerSync()

  const watchdog = (): ProviderWatchdogConfig =>
    (serverSync().data.config as { provider_watchdog?: ProviderWatchdogConfig }).provider_watchdog ?? {}
  const guards = (): RuntimeGuardsConfig =>
    (serverSync().data.config as { runtime_guards?: RuntimeGuardsConfig }).runtime_guards ?? {}

  async function persistWatchdog(patch: Partial<ProviderWatchdogConfig>) {
    await serverSync()
      .updateConfig({ provider_watchdog: { ...watchdog(), ...patch } } as never)
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: language.t("settings.recovery.watchdog.toast.failed"),
          description: error instanceof Error ? error.message : String(error),
        })
      })
  }

  async function persistGuards(patch: Partial<RuntimeGuardsConfig>) {
    await serverSync()
      .updateConfig({ runtime_guards: { ...guards(), ...patch } } as never)
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: language.t("settings.recovery.guards.toast.failed"),
          description: error instanceof Error ? error.message : String(error),
        })
      })
  }

  // Two-step confirm for the destructive-ish action: first click arms, second click fires.
  const [armed, setArmed] = createSignal(false)
  let disarm: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(disarm))

  const resetUi = () => {
    if (!armed()) {
      setArmed(true)
      clearTimeout(disarm)
      disarm = setTimeout(() => setArmed(false), 4000)
      return
    }
    for (const target of UI_PREF_TARGETS) removePersisted(target, platform)
    try {
      for (const key of UI_PREF_RAW_KEYS) localStorage.removeItem(key)
    } catch {
      // localStorage unavailable — the persisted-store removal above still applies.
    }
    location.reload()
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.recovery")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.recovery.watchdog.enabled.title")}
              description={language.t("settings.recovery.watchdog.enabled.description")}
            >
              <Switch
                checked={watchdog().enabled === true}
                onChange={(checked) => void persistWatchdog({ enabled: checked })}
                hideLabel
              >
                {language.t("settings.recovery.watchdog.enabled.title")}
              </Switch>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.recovery.watchdog.inactivity.title")}
              description={language.t("settings.recovery.watchdog.inactivity.description")}
            >
              <div class="w-full sm:w-[140px]">
                <TextInputV2
                  type="number"
                  appearance="base"
                  min="1000"
                  value={watchdog().inactivityMs ?? 120000}
                  disabled={watchdog().enabled !== true}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.currentTarget.value, 10)
                    if (Number.isFinite(parsed) && parsed >= 1000) void persistWatchdog({ inactivityMs: parsed })
                  }}
                  aria-label={language.t("settings.recovery.watchdog.inactivity.title")}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.recovery.watchdog.absolute.title")}
              description={language.t("settings.recovery.watchdog.absolute.description")}
            >
              <div class="w-full sm:w-[140px]">
                <TextInputV2
                  type="number"
                  appearance="base"
                  min="1000"
                  value={watchdog().absoluteMs ?? 900000}
                  disabled={watchdog().enabled !== true}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.currentTarget.value, 10)
                    if (Number.isFinite(parsed) && parsed >= 1000) void persistWatchdog({ absoluteMs: parsed })
                  }}
                  aria-label={language.t("settings.recovery.watchdog.absolute.title")}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.recovery.guards.enabled.title")}
              description={language.t("settings.recovery.guards.enabled.description")}
            >
              <Switch
                checked={guards().enabled !== false}
                onChange={(checked) => void persistGuards({ enabled: checked })}
                hideLabel
              >
                {language.t("settings.recovery.guards.enabled.title")}
              </Switch>
            </SettingsRowV2>

            {(
              [
                ["maxToolCallsPerTurn", 32, "turn"],
                ["maxToolCallsPerDrain", 96, "drain"],
                ["maxInboxBacklog", 128, "inbox"],
                ["maxStreamedOutputBytes", 8388608, "output"],
              ] as const
            ).map(([key, fallback, label]) => (
              <SettingsRowV2
                title={language.t(`settings.recovery.guards.${label}.title`)}
                description={language.t(`settings.recovery.guards.${label}.description`)}
              >
                <div class="w-full sm:w-[140px]">
                  <TextInputV2
                    type="number"
                    appearance="base"
                    min="1"
                    value={guards()[key] ?? fallback}
                    disabled={guards().enabled === false}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.currentTarget.value, 10)
                      if (Number.isFinite(parsed) && parsed >= 1) void persistGuards({ [key]: parsed })
                    }}
                    aria-label={language.t(`settings.recovery.guards.${label}.title`)}
                  />
                </div>
              </SettingsRowV2>
            ))}

            <SettingsRowV2
              title={language.t("settings.recovery.row.resetUi.title")}
              description={language.t("settings.recovery.row.resetUi.description")}
            >
              <ButtonV2
                size="normal"
                variant={armed() ? "danger" : "neutral"}
                onClick={resetUi}
                data-action="settings-recovery-reset-ui"
              >
                {armed()
                  ? language.t("settings.recovery.row.resetUi.confirm")
                  : language.t("settings.recovery.row.resetUi.action")}
              </ButtonV2>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.recovery.row.snapshots.title")}
              description={language.t("settings.recovery.row.snapshots.description")}
            >
              <ButtonV2 size="normal" variant="neutral" disabled data-action="settings-recovery-snapshots">
                {language.t("settings.recovery.row.snapshots.action")}
              </ButtonV2>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.recovery.row.factory.title")}
              description={language.t("settings.recovery.row.factory.description")}
            >
              <ButtonV2 size="normal" variant="neutral" disabled data-action="settings-recovery-factory-reset">
                {language.t("settings.recovery.row.factory.action")}
              </ButtonV2>
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
