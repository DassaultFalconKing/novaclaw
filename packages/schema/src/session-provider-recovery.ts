export * as SessionProviderRecovery from "./session-provider-recovery"

import { Schema } from "effect"
import { Event } from "./event"
import { Model } from "./model"
import { DateTimeUtcFromMillis } from "./schema"
import { SessionMessage } from "./session-message"

/**
 * A provider call that was durably marked before dispatch but never reached an ordinary
 * settlement boundary. While the owning process is alive this is simply the active attempt;
 * after restart it is the proof that the previous outcome is unknown and needs user authority.
 */
export const Info = Schema.Struct({
  attemptID: Event.ID,
  assistantMessageID: SessionMessage.ID,
  model: Model.Ref,
  startedAt: DateTimeUtcFromMillis,
  toolProtocol: Schema.Boolean,
}).annotate({ identifier: "Session.ProviderRecovery" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
