import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260801190243_add_session_provider_recovery",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`provider_recovery\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
