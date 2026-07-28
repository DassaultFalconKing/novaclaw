import { expect, test, type Page, type Route } from "@playwright/test"
import { mockNovaClawServer } from "../utils/mock-server"
import { trackPageErrors } from "../utils/errors"

const directory = "/tmp/novaclaw-interface-smoke"
const pages = [
  { path: "/", title: "Settings" },
  { path: "/chats" },
  { path: "/files", title: "Files" },
  { path: "/notes", title: "Notes" },
  { path: "/calendar", title: "Calendar" },
  { path: "/recipes", title: "Recipes" },
  { path: "/registry", title: "Registry" },
  { path: "/debug", title: "Debug" },
  { path: "/memory-graph", title: "Memory graph" },
  { path: "/trash", title: "Trash" },
] as const

test.beforeEach(async ({ page }) => {
  await mockNovaClawServer(page, {
    directory,
    project: {
      id: "project_interface_smoke",
      worktree: directory,
      vcs: "git",
      name: "interface-smoke",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await mockPageApis(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: true, expertiseLevel: "developer" } }),
    )
    localStorage.setItem("novaclaw.help.seen", "1")
  })
})

test("opens Settings and exposes a local OpenAI-compatible endpoint", async ({ page }) => {
  await page.goto("/")

  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page.getByRole("tab", { name: "General", exact: true })).toBeVisible()

  await page.getByRole("tab", { name: "Models", exact: true }).click()
  await page.getByRole("button", { name: "Add models", exact: true }).click()
  await page.getByRole("button", { name: "Local model container", exact: true }).click()

  await expect(page.getByRole("textbox", { name: "Endpoint URL", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Endpoint URL", exact: true })).toHaveValue(
    "http://localhost:8000/v1",
  )
  await expect(page.getByRole("textbox", { name: "Short name (ID)", exact: true })).toHaveValue("local-model")
})

test("renders every registered application page without UI errors", async ({ page }) => {
  const errors = trackPageErrors(page)

  for (const entry of pages) {
    await page.goto(entry.path)
    await expect(page.locator("main")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0)
    if (entry.title) await expect(page.getByText(entry.title, { exact: true }).first()).toBeVisible()
  }

  expect(errors).toEqual([])
})

test("activates every launcher tile and internal application link", async ({ page }) => {
  const routes = new Map([
    ["Chats", "/chats"],
    ["Notes", "/notes"],
    ["Calendar", "/calendar"],
    ["Recipes", "/recipes"],
    ["Files", "/files"],
    ["Registry", "/registry"],
    ["Debug", "/debug"],
    ["Memory graph", "/memory-graph"],
    ["Trash", "/trash"],
  ])

  for (const [name, path] of routes) {
    await page.goto("/")
    await page.getByRole("button", { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`))
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0)
  }

  await page.goto("/memory-graph")
  await page.getByRole("link", { name: "Home", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  for (const name of ["Search", "Terminal", "Community", "Help"]) {
    await page.getByRole("button", { name, exact: true }).click()
    await expect(page.locator("[data-dialog-layer]")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-dialog-layer]")).toHaveCount(0)
  }
})

async function mockPageApis(page: Page) {
  await page.route("**/*", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/api/session") return json(route, [])
    if (path === "/file" || path === "/file/trash") return json(route, [])
    if (path === "/api/calendar/schedule" || path === "/api/calendar/fires") return json(route, [])
    if (path === "/api/recipe" || path === "/registry/tables" || path === "/scheduler/snapshot")
      return json(route, [])
    if (path === "/memory/graph") return json(route, { nodes: [], edges: [] })
    return route.fallback()
  })
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}
