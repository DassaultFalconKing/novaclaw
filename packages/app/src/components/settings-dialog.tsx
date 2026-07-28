import { useParams } from "@solidjs/router"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useDialog } from "@novaclaw/ui/context/dialog"
import { DialogSettings } from "@/components/settings-v2"

export function useSettingsDialog(defaultTab?: string) {
  const dialog = useDialog()
  const params = useParams<{ id?: string }>()

  return () => {
    const sessionID = params.id
    void dialog.show(() => <DialogSettings sessionID={sessionID} defaultTab={defaultTab} />)
  }
}

export function useSettingsCommand() {
  const command = useCommand()
  const language = useLanguage()
  const show = useSettingsDialog()

  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}
