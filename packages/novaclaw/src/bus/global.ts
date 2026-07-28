import { EventEmitter } from "events"
import { Identifier } from "@/id/id"

export type GlobalEvent = {
  directory?: string
  project?: string
  workspace?: string
  payload: any
}

class GlobalBusEmitter {
  private readonly emitter = new EventEmitter<{ event: [GlobalEvent] }>()

  on(eventName: "event", listener: (event: GlobalEvent) => void) {
    this.emitter.on(eventName, listener)
    return this
  }

  off(eventName: "event", listener: (event: GlobalEvent) => void) {
    this.emitter.off(eventName, listener)
    return this
  }

  emit(eventName: "event", event: GlobalEvent) {
    if (event.payload && typeof event.payload === "object" && !("id" in event.payload)) {
      event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending")
    }
    return this.emitter.emit(eventName, event)
  }
}

export const GlobalBus = new GlobalBusEmitter()
