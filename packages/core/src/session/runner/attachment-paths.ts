export * as AttachmentPaths from "./attachment-paths"

import fs from "node:fs"
import { fileURLToPath } from "node:url"
import type { SessionMessage } from "../message"

/**
 * Resolve the structured attachment set once before a provider turn. Materialized attachments
 * retain their original local identity in `sourceUri`; ordinary file attachments use `uri`.
 */
export const resolve = (messages: readonly SessionMessage.Message[]): ReadonlySet<string> =>
  new Set(
    messages.flatMap((message) =>
      message.type !== "user"
        ? []
        : (message.files ?? []).flatMap((file) => {
            const uri = (file as typeof file & { readonly sourceUri?: string }).sourceUri ?? file.uri
            if (!uri.startsWith("file:")) return []
            try {
              return [fs.realpathSync(fileURLToPath(uri))]
            } catch {
              return []
            }
          }),
    ),
  )
