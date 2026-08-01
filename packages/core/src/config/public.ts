export * as ConfigPublic from "./public"

export const REDACTED = "<redacted>"

type JsonObject = Record<string, unknown>

/** Public renderer/export projection. Runtime config and SQLite keep the original secret values. */
export function redact(input: JsonObject): JsonObject {
  const mcp = object(input.mcp)
  const servers = object(mcp?.servers)
  if (!mcp || !servers) return { ...input }
  return {
    ...input,
    mcp: {
      ...mcp,
      servers: Object.fromEntries(
        Object.entries(servers).map(([name, value]) => {
          const server = object(value)
          if (!server) return [name, value]
          if (server.type === "local")
            return [
              name,
              {
                ...server,
                command: [REDACTED],
                ...(object(server.environment)
                  ? { environment: redactRecord(object(server.environment)!) }
                  : {}),
              },
            ]
          const oauth = object(server.oauth)
          return [
            name,
            {
              ...server,
              url: REDACTED,
              ...(object(server.headers) ? { headers: redactRecord(object(server.headers)!) } : {}),
              ...(oauth ? { oauth: { ...oauth, ...(oauth.client_secret === undefined ? {} : { client_secret: REDACTED }) } } : {}),
            },
          ]
        }),
      ),
    },
  }
}

/** Remove public placeholders before patch-merge, so a toggle/export import cannot erase secrets. */
export function stripRedacted(input: unknown): unknown {
  if (input === REDACTED) return undefined
  if (Array.isArray(input)) {
    const values = input.map(stripRedacted).filter((value) => value !== undefined)
    return values.length === 0 ? undefined : values
  }
  const value = object(input)
  if (!value) return input
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const stripped = stripRedacted(item)
      return stripped === undefined ? [] : [[key, stripped]]
    }),
  )
}

const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined

const redactRecord = (value: JsonObject) => Object.fromEntries(Object.keys(value).map((key) => [key, REDACTED]))
