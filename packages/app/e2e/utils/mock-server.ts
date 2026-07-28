import type { Page, Route } from "@playwright/test"

const emptyList = new Set(["/skill", "/command", "/formatter", "/vcs/status", "/vcs/diff"])
const emptyObject = new Set(["/global/config", "/config", "/provider/auth", "/mcp", "/session/status"])

export interface MockServerConfig {
  provider: unknown
  directory: string
  project: unknown
  sessions: ({ id: string } & Record<string, unknown>)[]
  pageMessages: (sessionId: string, limit: number, before?: string) => { items: unknown[]; cursor?: string }
  vcsDiff?: unknown[]
  messageDelay?: number
  onMessages?: (input: { sessionID: string; before?: string; phase: "start" | "end" }) => void
  events?: () => unknown[]
  eventRetry?: number
  todos?: (sessionID: string) => unknown[]
  permissions?: unknown[] | (() => unknown[])
  questions?: unknown[] | (() => unknown[])
}

export async function mockNovaClawServer(page: Page, config: MockServerConfig) {
  const cursors = new Map<string, string>()
  let nextCursor = 0
  const sessions = config.sessions.map((session) => ({
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    location: { directory: config.directory },
    ...session,
  }))
  const provider = config.provider as {
    all?: Array<{
      id: string
      name: string
      models?: Record<string, Record<string, unknown> & { id?: string; name?: string; variants?: Record<string, unknown> }>
      [key: string]: unknown
    }>
    connected?: string[]
    default?: Record<string, string>
  }
  const providerCatalog = {
    providers: (provider.all ?? []).map((item) => ({
      api: { id: item.id, type: "native", settings: {} },
      request: { headers: {}, body: {} },
      ...item,
      models: undefined,
    })),
    models: (provider.all ?? []).flatMap((item) =>
      Object.values(item.models ?? {}).map((model) => ({
        ...model,
        api: { id: model.id ?? "model", type: "native", settings: {} },
        capabilities: {},
        request: { headers: {}, body: {} },
        variants: Object.keys(model.variants ?? {}).map((id) => ({ id, headers: {}, body: {} })),
        time: { released: 0 },
        cost: [],
        status: "active",
        enabled: true,
        providerID: item.id,
      })),
    ),
    connected: provider.connected ?? [],
    default: provider.default ?? {},
  }
  const staticRoutes: Record<string, unknown> = {
    "/provider": providerCatalog,
    "/path": {
      state: config.directory,
      config: config.directory,
      worktree: config.directory,
      directory: config.directory,
      home: "C:/NovaClaw",
    },
    "/project": [config.project],
    "/project/current": config.project,
    "/agent": [{ name: "build", mode: "primary" }],
    "/vcs": { branch: "main", default_branch: "main" },
    "/session": config.sessions,
  }

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    const targetPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
    const appPort = new URL(
      process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`,
    ).port
    if (url.port !== targetPort && url.port !== appPort) return route.fallback()

    const path = url.pathname
    if (path === "/global/event" || path === "/event") return sse(route, config.events?.(), config.eventRetry)
    if (path === "/global/health") return json(route, { healthy: true })
    if (path === "/api/session") return json(route, { data: sessions, cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (path === "/api/tag") return json(route, { data: {} })
    if (path === "/api/permission/request")
      return json(route, {
        location: {
          directory: config.directory,
          root: config.directory,
          origin: config.directory,
        },
        data: (typeof config.permissions === "function" ? config.permissions() : (config.permissions ?? [])).map(
          (permission) => {
            if (!permission || typeof permission !== "object") return permission
            const item = permission as Record<string, unknown>
            return {
              ...item,
              action: item.action ?? item.permission,
              resources: item.resources ?? item.patterns ?? [],
              save: item.save ?? item.always,
            }
          },
        ),
      })
    if (path === "/api/messenger/driver" || path === "/api/messenger/account" || path === "/api/messenger/binding")
      return json(route, [])
    if (path === "/permission")
      return json(route, typeof config.permissions === "function" ? config.permissions() : (config.permissions ?? []))
    if (path === "/question")
      return json(route, typeof config.questions === "function" ? config.questions() : (config.questions ?? []))
    if (path === "/vcs/diff" && config.vcsDiff) return json(route, config.vcsDiff)
    if (emptyObject.has(path)) return json(route, {})
    if (emptyList.has(path)) return json(route, [])
    if (path in staticRoutes) return json(route, staticRoutes[path])

    const sessionMatch = path.match(/^\/session\/([^/]+)$/)
    if (sessionMatch) {
      const session = config.sessions.find((s) => s.id === sessionMatch[1])
      return json(route, session ?? {})
    }

    const apiSessionMatch = path.match(/^\/api\/session\/([^/]+)$/)
    if (apiSessionMatch) {
      const session = sessions.find((item) => item.id === apiSessionMatch[1])
      return json(route, { data: session })
    }

    const todoMatch = path.match(/^\/session\/([^/]+)\/todo$/)
    if (todoMatch) return json(route, config.todos?.(todoMatch[1]!) ?? [])
    if (/^\/session\/[^/]+\/(children|diff)$/.test(path)) return json(route, [])

    const apiTodoMatch = path.match(/^\/api\/session\/([^/]+)\/todo$/)
    if (apiTodoMatch) return json(route, { data: config.todos?.(apiTodoMatch[1]!) ?? [] })

    const apiMessagesMatch = path.match(/^\/api\/session\/([^/]+)\/message$/)
    if (apiMessagesMatch) return json(route, { data: [], cursor: {} })

    const messagesMatch = path.match(/^\/session\/([^/]+)\/message$/)
    if (messagesMatch) {
      const token = url.searchParams.get("before") ?? undefined
      const before = token ? cursors.get(token) : undefined
      if (token && !before) return json(route, { error: "Invalid cursor" }, undefined, 400)
      config.onMessages?.({ sessionID: messagesMatch[1], before, phase: "start" })
      if (config.messageDelay) await new Promise((resolve) => setTimeout(resolve, config.messageDelay))
      const limit = Number(url.searchParams.get("limit") ?? 80)
      const pageData = config.pageMessages(messagesMatch[1], limit, before)
      config.onMessages?.({ sessionID: messagesMatch[1], before, phase: "end" })
      if (!pageData.cursor) return json(route, pageData.items)
      const cursor = `cursor_${++nextCursor}`
      cursors.set(cursor, pageData.cursor)
      return json(route, pageData.items, { "x-next-cursor": cursor })
    }

    if (url.port === targetPort && targetPort !== appPort) return json(route, {})
    return route.fallback()
  })
}

function json(route: Route, body: unknown, headers?: Record<string, string>, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-next-cursor",
      ...headers,
    },
    body: JSON.stringify(body ?? null),
  })
}

function sse(route: Route, events?: unknown[], retry?: number) {
  return route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: `${retry === undefined ? "" : `retry: ${retry}\n\n`}${events?.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") || ": ok\n\n"}`,
  })
}
