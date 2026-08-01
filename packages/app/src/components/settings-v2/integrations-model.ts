export type McpServer =
  | { type: "local"; command: string[]; disabled?: boolean }
  | { type: "remote"; url: string; disabled?: boolean }

export function parseMcpServer(type: "local" | "remote", endpoint: string): McpServer | undefined {
  if (type === "remote") {
    try {
      const url = new URL(endpoint)
      if (url.protocol !== "http:" && url.protocol !== "https:") return
      return { type, url: url.toString() }
    } catch {
      return
    }
  }

  try {
    const command: unknown = JSON.parse(endpoint)
    if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || !part))
      return
    return { type, command }
  } catch {
    return
  }
}
