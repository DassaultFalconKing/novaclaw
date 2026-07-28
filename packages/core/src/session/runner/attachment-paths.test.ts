import { afterEach, describe, expect, test } from "bun:test"
import { DateTime } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { SessionMessage } from "../message"
import { AttachmentPaths } from "./attachment-paths"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

const user = (uri: string, sourceUri?: string) =>
  ({
    id: SessionMessage.ID.make("msg_attachment"),
    type: "user",
    text: "Use the attached task specification.",
    files: [
      {
        uri,
        ...(sourceUri === undefined ? {} : { sourceUri }),
        mime: "text/markdown",
        name: "task spec.md",
      },
    ],
    time: { created: DateTime.makeUnsafe(1) },
  }) as unknown as SessionMessage.Message

describe("AttachmentPaths.resolve", () => {
  test("percent-decodes a file URI and resolves symlink identity", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novaclaw-attachment-"))
    directories.push(directory)
    const target = path.join(directory, "task spec.md")
    const alias = path.join(directory, "alias.md")
    fs.writeFileSync(target, "task")
    fs.symlinkSync(target, alias)

    expect([...AttachmentPaths.resolve([user(pathToFileURL(alias).href)])]).toEqual([fs.realpathSync(target)])
  })

  test("uses sourceUri for a materialized data attachment", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novaclaw-attachment-"))
    directories.push(directory)
    const target = path.join(directory, "task.md")
    fs.writeFileSync(target, "task")

    expect([
      ...AttachmentPaths.resolve([
        user("data:text/markdown;base64,dGFzaw==", pathToFileURL(target).href),
      ]),
    ]).toEqual([fs.realpathSync(target)])
  })

  test("ignores non-file and missing attachment identities", () => {
    expect([...AttachmentPaths.resolve([user("data:text/plain,task")])]).toEqual([])
    expect([...AttachmentPaths.resolve([user("file:///definitely/missing/novaclaw-task.md")])]).toEqual([])
  })
})
