export const frontendChunkBudget = {
  entryBytes: 900_000,
  assetBytes: 1_000_000,
}

export function frontendChunk(id) {
  const source = id.replaceAll("\\", "/")

  if (source.includes("/packages/app/src/i18n/")) return "novaclaw-locales-app"
  if (source.includes("/packages/ui/src/i18n/") || source.includes("/packages/desktop/src/renderer/i18n/"))
    return "novaclaw-locales-shell"
  if (source.includes("/packages/app/src/components/settings-v2/")) return "novaclaw-settings"
  if (source.includes("/packages/ui/")) return "novaclaw-ui"
  if (
    source.includes("/packages/core/") ||
    source.includes("/packages/schema/") ||
    source.includes("/packages/protocol/") ||
    source.includes("/packages/sdk/")
  )
    return "novaclaw-runtime"

  if (!source.includes("/node_modules/")) return undefined
  if (includesPackage(source, ["effect", "@standard-schema", "sury"])) return "vendor-effect"
  if (includesPackage(source, ["marked", "marked-shiki", "katex", "dompurify", "morphdom"]))
    return "vendor-markdown"
  if (includesPackage(source, ["@pierre", "diff"])) return "vendor-diff"
  if (includesPackage(source, ["ghostty-web", "@xterm"])) return "vendor-terminal"
  if (
    includesPackage(source, [
      "solid-js",
      "@solidjs",
      "@solid-primitives",
      "@kobalte",
      "@tanstack",
      "@dnd-kit",
      "@thisbeyond",
      "@floating-ui",
    ])
  )
    return "vendor-solid-ui"
  return undefined
}

function includesPackage(source, packages) {
  return packages.some((name) => source.includes(`/node_modules/${name}/`) || source.includes(`/${name.replace("/", "+")}@`))
}
