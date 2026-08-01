import { ButtonV2 } from "@novaclaw/ui/v2/button-v2"
import { SelectV2 } from "@novaclaw/ui/v2/select-v2"
import { Switch } from "@novaclaw/ui/v2/switch-v2"
import { TextInputV2 } from "@novaclaw/ui/v2/text-input-v2"
import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { useConfirm } from "@/components/dialog-confirm"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { parseMcpServer, type McpServer } from "./integrations-model"
import "./settings-v2.css"

type IntegrationsConfig = {
  skills?: string[]
  mcp?: { servers?: Record<string, McpServer> }
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,63}$/

export const SettingsIntegrationsV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const confirm = useConfirm()
  const config = () => serverSync().data.config as IntegrationsConfig
  const skills = () => config().skills ?? []
  const mcpServers = () => config().mcp?.servers ?? {}
  const mcpEntries = createMemo(() => Object.entries(mcpServers()).sort(([left], [right]) => left.localeCompare(right)))
  const mcpTypes = () => [
    { value: "local" as const, label: language.t("settings.integrations.mcp.local") },
    { value: "remote" as const, label: language.t("settings.integrations.mcp.remote") },
  ]

  const [skillSource, setSkillSource] = createSignal("")
  const [skillError, setSkillError] = createSignal<string>()
  const [mcpName, setMcpName] = createSignal("")
  const [mcpType, setMcpType] = createSignal<"local" | "remote">("local")
  const [mcpEndpoint, setMcpEndpoint] = createSignal("")
  const [mcpError, setMcpError] = createSignal<string>()
  const mcpPlaceholder = () =>
    mcpType() === "local"
      ? language.t("settings.integrations.mcp.local.placeholder")
      : language.t("settings.integrations.mcp.remote.placeholder")

  async function update(patch: IntegrationsConfig, failureTitle: string) {
    return serverSync()
      .updateConfig(patch as never)
      .then(() => true)
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: failureTitle,
          description: error instanceof Error ? error.message : String(error),
        })
        return false
      })
  }

  async function addSkill() {
    const source = skillSource().trim()
    if (!source) return setSkillError(language.t("settings.integrations.skills.error.empty"))
    if (skills().includes(source)) return setSkillError(language.t("settings.integrations.skills.error.duplicate"))
    if (!(await update({ skills: [...skills(), source] }, language.t("settings.integrations.skills.toast.failed"))))
      return
    setSkillSource("")
    setSkillError(undefined)
  }

  async function removeSkill(source: string) {
    const accepted = await confirm({
      title: language.t("settings.integrations.skills.confirm.title"),
      description: language.t("settings.integrations.skills.confirm.description", { source }),
      confirmLabel: language.t("common.delete"),
      destructive: true,
    })
    if (!accepted) return
    await update(
      { skills: skills().filter((candidate) => candidate !== source) },
      language.t("settings.integrations.skills.toast.failed"),
    )
  }

  async function addMcp() {
    const name = mcpName().trim()
    if (!NAME_PATTERN.test(name)) return setMcpError(language.t("settings.integrations.mcp.error.name"))
    if (mcpServers()[name]) return setMcpError(language.t("settings.integrations.mcp.error.duplicate"))

    const endpoint = mcpEndpoint().trim()
    const server = parseMcpServer(mcpType(), endpoint)
    if (!server)
      return setMcpError(
        mcpType() === "local"
          ? language.t("settings.integrations.mcp.error.local")
          : language.t("settings.integrations.mcp.error.remote"),
      )
    if (!(await update({ mcp: { servers: { [name]: server } } }, language.t("settings.integrations.mcp.toast.failed"))))
      return
    setMcpName("")
    setMcpEndpoint("")
    setMcpError(undefined)
  }

  async function toggleMcp(name: string, server: McpServer, enabled: boolean) {
    await update(
      { mcp: { servers: { [name]: { ...server, disabled: !enabled } } } },
      language.t("settings.integrations.mcp.toast.failed"),
    )
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.integrations.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.integrations.description")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.integrations.skills.title")}</h3>
          <p class="settings-v2-field-description">{language.t("settings.integrations.skills.description")}</p>
          <Show
            when={skills().length > 0}
            fallback={<div class="settings-v2-models-status">{language.t("settings.integrations.skills.empty")}</div>}
          >
            <SettingsListV2>
              <For each={skills()}>
                {(source) => (
                  <SettingsRowV2 title={source} description={language.t("settings.integrations.skills.source")}>
                    <ButtonV2 size="small" variant="neutral" onClick={() => void removeSkill(source)}>
                      {language.t("common.delete")}
                    </ButtonV2>
                  </SettingsRowV2>
                )}
              </For>
            </SettingsListV2>
          </Show>
          <div class="settings-v2-integrations-editor">
            <TextInputV2
              type="text"
              appearance="base"
              value={skillSource()}
              placeholder={language.t("settings.integrations.skills.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              onInput={(event) => setSkillSource(event.currentTarget.value)}
              aria-label={language.t("settings.integrations.skills.placeholder")}
            />
            <ButtonV2 size="small" variant="neutral" onClick={() => void addSkill()}>
              {language.t("settings.integrations.skills.add")}
            </ButtonV2>
          </div>
          <Show when={skillError()}>
            <p class="settings-v2-field-error">{skillError()}</p>
          </Show>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.integrations.mcp.title")}</h3>
          <p class="settings-v2-field-description">{language.t("settings.integrations.mcp.description")}</p>
          <Show
            when={mcpEntries().length > 0}
            fallback={<div class="settings-v2-models-status">{language.t("settings.integrations.mcp.empty")}</div>}
          >
            <SettingsListV2>
              <For each={mcpEntries()}>
                {([name, server]) => (
                  <SettingsRowV2
                    title={name}
                    description={server.type === "local" ? server.command.join(" ") : server.url}
                  >
                    <Switch
                      checked={server.disabled !== true}
                      onChange={(checked) => void toggleMcp(name, server, checked)}
                      hideLabel
                    >
                      {name}
                    </Switch>
                  </SettingsRowV2>
                )}
              </For>
            </SettingsListV2>
          </Show>
          <div class="settings-v2-integrations-editor settings-v2-integrations-editor--mcp">
            <TextInputV2
              type="text"
              appearance="base"
              value={mcpName()}
              placeholder={language.t("settings.integrations.mcp.name")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              onInput={(event) => setMcpName(event.currentTarget.value)}
              aria-label={language.t("settings.integrations.mcp.name")}
            />
            <SelectV2
              appearance="base"
              options={mcpTypes()}
              current={mcpTypes().find((option) => option.value === mcpType())}
              value={(option) => option.value}
              label={(option) => option.label}
              onSelect={(option) => option && setMcpType(option.value)}
            />
            <TextInputV2
              type="text"
              appearance="base"
              value={mcpEndpoint()}
              placeholder={mcpPlaceholder()}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              onInput={(event) => setMcpEndpoint(event.currentTarget.value)}
              aria-label={mcpPlaceholder()}
            />
            <ButtonV2 size="small" variant="neutral" onClick={() => void addMcp()}>
              {language.t("settings.integrations.mcp.add")}
            </ButtonV2>
          </div>
          <Show when={mcpError()}>
            <p class="settings-v2-field-error">{mcpError()}</p>
          </Show>
        </div>
      </div>
    </>
  )
}
