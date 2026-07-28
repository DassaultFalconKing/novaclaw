import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260728104830_add_session_completion_guard",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`completion_guard\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
