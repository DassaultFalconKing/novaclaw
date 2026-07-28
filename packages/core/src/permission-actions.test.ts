import { describe, expect, test } from "bun:test"
import { DateTime } from "effect"
import { PermissionV2 } from "./permission"
import { LocationMutation } from "./location-mutation"
import { SessionMessage } from "./session/message"
import { FileAttachment } from "./session/prompt"
import { applySteerProvenance } from "./session/steer-provenance"

// 1I + 1J pure-logic coverage: the split action granularity (read-class external access never
// authorizes write-class) and the denial-as-observation message lowering.

const auth = { directory: "C:/soft/w64devkit", resource: "C:/soft/w64devkit/*", save: "C:/soft/w64devkit/*" }

describe("externalDirectoryPermission — classed access (1I)", () => {
  test("read access maps to external_directory_read", () => {
    expect(LocationMutation.externalDirectoryPermission(auth, "read")).toEqual({
      action: "external_directory_read",
      resources: ["C:/soft/w64devkit/*"],
      save: ["C:/soft/w64devkit/*"],
    })
  })

  test("write access maps to external_directory_write", () => {
    expect(LocationMutation.externalDirectoryPermission(auth, "write").action).toBe("external_directory_write")
  })

  test("a saved READ grant does not satisfy a WRITE check (the w64devkit case)", () => {
    const savedReadGrant = [{ action: "external_directory_read", resource: "C:/soft/w64devkit/*", effect: "allow" as const }]
    const read = PermissionV2.evaluate("external_directory_read", "C:/soft/w64devkit/bin", savedReadGrant)
    const write = PermissionV2.evaluate("external_directory_write", "C:/soft/w64devkit/bin", savedReadGrant)
    expect(read.effect).toBe("allow")
    expect(write.effect).toBe("ask") // falls through to the default — never silently allowed
  })

  test("write and create are independent grants from edit", () => {
    const editGrant = [{ action: "edit", resource: "*", effect: "allow" as const }]
    expect(PermissionV2.evaluate("edit", "src/x.ts", editGrant).effect).toBe("allow")
    expect(PermissionV2.evaluate("write", "src/x.ts", editGrant).effect).toBe("ask")
    expect(PermissionV2.evaluate("create", "src/x.ts", editGrant).effect).toBe("ask")
  })
})

describe("denialMessage — denial as observation (1J)", () => {
  test("DeniedError surfaces the denying action + resource", () => {
    const error = new PermissionV2.DeniedError({
      rules: [
        { action: "write", resource: "*", effect: "deny" },
        { action: "read", resource: "*", effect: "allow" },
      ],
    })
    const message = PermissionV2.denialMessage(error)!
    expect(message).toContain("'write'")
    expect(message).toContain("denied by policy")
    expect(message).toContain("Do not retry")
    expect(message).not.toContain("'read'") // only the denying rules are named
  })

  // Deny-fast: what the agent SEES when the unattended confinement stance refuses it. The generic
  // wording ends in "ask the user to adjust permissions" — the one instruction that hangs an
  // unattended run — so the tagged reason must swap it for a way forward inside the work folder.
  test("an unattended-confined denial tells the agent to work in its folder, NEVER to ask/wait", () => {
    const error = new PermissionV2.DeniedError({
      rules: [{ action: "external_directory_write", resource: "*", effect: "deny" }],
      reason: "unattended-confined",
    })
    const message = PermissionV2.denialMessage(error)!
    expect(message).toContain("UNATTENDED")
    expect(message).toContain("working folder")
    expect(message).toContain("external_directory_write")
    expect(message).toContain("waiting or retrying will change nothing")
    expect(message).not.toContain("ask the user")
  })

  test("an untagged denial keeps the generic policy wording (attended sessions unchanged)", () => {
    const message = PermissionV2.denialMessage(
      new PermissionV2.DeniedError({ rules: [{ action: "write", resource: "*", effect: "deny" }] }),
    )!
    expect(message).toContain("denied by policy")
    expect(message).toContain("ask the user to adjust permissions")
    expect(message).not.toContain("UNATTENDED")
  })

  test("an attachment-source denial redirects the model to a verified output file", () => {
    const message = PermissionV2.denialMessage(
      new PermissionV2.DeniedError({
        rules: [{ action: "edit", resource: "task.md", effect: "deny" }],
        reason: "attachment-source",
      }),
    )!
    expect(message).toContain("attached task input")
    expect(message).toContain("read-only")
    expect(message).toContain("Create the requested output file")
    expect(message).toContain("read that output back")
    expect(message).not.toContain("ask the user")
  })

  test("CorrectedError carries the user's reason verbatim", () => {
    const message = PermissionV2.denialMessage(
      new PermissionV2.CorrectedError({ feedback: "w64devkit is a read-only toolchain — write under the project" }),
    )!
    expect(message).toContain("w64devkit is a read-only toolchain — write under the project")
    expect(message).toContain("declined")
  })

  test("RejectedError becomes a redirect, not a dead end", () => {
    const message = PermissionV2.denialMessage(new PermissionV2.RejectedError())!
    expect(message).toContain("declined")
    expect(message).toContain("Do not retry")
  })

  test("non-permission errors pass through untouched", () => {
    expect(PermissionV2.denialMessage(new Error("ENOENT"))).toBeUndefined()
    expect(PermissionV2.denialMessage("string")).toBeUndefined()
    expect(PermissionV2.denialMessage(undefined)).toBeUndefined()
  })
})

const attachedUser = (text: string, name = "task.md", id = "msg_attached") =>
  SessionMessage.User.make({
    id: SessionMessage.ID.make(id),
    type: "user",
    text,
    files: [FileAttachment.make({ uri: "data:text/markdown,task", mime: "text/markdown", name })],
    time: { created: DateTime.makeUnsafe(1) },
  })

const plainUser = (text: string, id = "msg_followup") =>
  SessionMessage.User.make({
    id: SessionMessage.ID.make(id),
    type: "user",
    text,
    time: { created: DateTime.makeUnsafe(2) },
  })

describe("protectedAttachmentResource — immutable task input", () => {
  test("blocks edit, overwrite, and trash of an attached specification", () => {
    const messages = [attachedUser("Use the attached document as the task specification.")]
    expect(PermissionV2.protectedAttachmentResource(messages, "edit", ["task.md"])).toBe("task.md")
    expect(PermissionV2.protectedAttachmentResource(messages, "write", ["/project/task.md"])).toBe("/project/task.md")
    expect(PermissionV2.protectedAttachmentResource(messages, "trash", [".\\task.md"])).toBe(".\\task.md")
  })

  test("does not block reading the attachment or writing a different output", () => {
    const messages = [attachedUser("Use the attached document as the task specification.")]
    expect(PermissionV2.protectedAttachmentResource(messages, "read", ["task.md"])).toBeUndefined()
    expect(PermissionV2.protectedAttachmentResource(messages, "write", ["result.md"])).toBeUndefined()
  })

  test("allows a trusted follow-up that explicitly names the attachment as the edit target", () => {
    const messages = [
      attachedUser("Review this task."),
      plainUser("Please fix and rewrite task.md itself.", "msg_authorize"),
    ]
    expect(PermissionV2.protectedAttachmentResource(messages, "edit", ["task.md"])).toBeUndefined()
  })

  test("does not treat a negated edit or an automated steer as authorization", () => {
    const negated = [attachedUser("Do not edit task.md; create result.md instead.")]
    expect(PermissionV2.protectedAttachmentResource(negated, "edit", ["task.md"])).toBe("task.md")

    const steer = [attachedUser("Review this task."), plainUser(applySteerProvenance("Edit task.md now."), "msg_steer")]
    expect(PermissionV2.protectedAttachmentResource(steer, "edit", ["task.md"])).toBe("task.md")
  })
})
