import { Context, Effect, Layer, Pipeable, Predicate, Queue, Stream } from "effect"
import * as View from "./View.js"


export const AppFocusServiceTypeId: unique symbol = Symbol.for("@effect-view/AppFocus/AppFocusService")
export type AppFocusServiceTypeId = typeof AppFocusServiceTypeId

/** Whether the app is focused, as used by Query's `refreshOnFocus`. */
export interface AppFocusService extends Pipeable.Pipeable {
    readonly [AppFocusServiceTypeId]: AppFocusServiceTypeId
    readonly focused: View.View<boolean>
}

export const isAppFocusService = (u: unknown): u is AppFocusService => Predicate.hasProperty(u, AppFocusServiceTypeId)

export class AppFocusServiceImpl extends Pipeable.Class implements AppFocusService {
    readonly [AppFocusServiceTypeId]: AppFocusServiceTypeId = AppFocusServiceTypeId

    constructor(
        readonly focused: View.View<boolean>,
    ) {
        super()
    }
}

export const make = (focused: View.View<boolean>): AppFocusService => new AppFocusServiceImpl(focused)

/** Whether the app is focused, as used by Query's `refreshOnFocus`. */
export class AppFocus extends Context.Service<AppFocus, AppFocusService>()(
    "@effect-view/AppFocus/AppFocus"
) {}

export const layerDummy: Layer.Layer<AppFocus> = Layer.succeed(
    AppFocus,
    make(View.make({
        get: Effect.succeed(true),
        changes: Stream.succeed(true),
    })),
)

const isDocumentVisible = () => globalThis.document.visibilityState === "visible"

/** Focused while the page is visible, following the document's `visibilitychange` events. */
export const layerBrowser: Layer.Layer<AppFocus> = Layer.succeed(
    AppFocus,
    make(View.make({
        get: Effect.sync(isDocumentVisible),
        changes: Stream.concat(
            Stream.sync(isDocumentVisible),
            Stream.callback<boolean>(queue => Effect.acquireRelease(
                Effect.sync(() => {
                    const listener = () => Queue.offerUnsafe(queue, isDocumentVisible())
                    globalThis.document.addEventListener("visibilitychange", listener)
                    return listener
                }),
                listener => Effect.sync(() => globalThis.document.removeEventListener("visibilitychange", listener)),
            )),
        ),
    })),
)
