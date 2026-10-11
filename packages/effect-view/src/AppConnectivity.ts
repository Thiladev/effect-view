import { Context, Effect, Layer, Pipeable, Predicate, Queue, Stream } from "effect"
import * as View from "./View.js"


export const AppConnectivityServiceTypeId: unique symbol = Symbol.for("@effect-view/AppConnectivity/AppConnectivityService")
export type AppConnectivityServiceTypeId = typeof AppConnectivityServiceTypeId

/** Whether the app has a network connection, as used by Query's `networkMode` and `refreshOnReconnect`. */
export interface AppConnectivityService extends Pipeable.Pipeable {
    readonly [AppConnectivityServiceTypeId]: AppConnectivityServiceTypeId
    readonly online: View.View<boolean>
}

export const isAppConnectivityService = (u: unknown): u is AppConnectivityService => Predicate.hasProperty(u, AppConnectivityServiceTypeId)

export class AppConnectivityServiceImpl extends Pipeable.Class implements AppConnectivityService {
    readonly [AppConnectivityServiceTypeId]: AppConnectivityServiceTypeId = AppConnectivityServiceTypeId

    constructor(
        readonly online: View.View<boolean>,
    ) {
        super()
    }
}

export const make = (online: View.View<boolean>): AppConnectivityService => new AppConnectivityServiceImpl(online)

/** Whether the app has a network connection, as used by Query's `networkMode` and `refreshOnReconnect`. */
export class AppConnectivity extends Context.Service<AppConnectivity, AppConnectivityService>()(
    "@effect-view/AppConnectivity/AppConnectivity"
) {}

export const layerDummy: Layer.Layer<AppConnectivity> = Layer.succeed(
    AppConnectivity,
    make(View.make({
        get: Effect.succeed(true),
        changes: Stream.succeed(true),
    })),
)

export const layerBrowser: Layer.Layer<AppConnectivity> = Layer.succeed(
    AppConnectivity,
    make(View.make({
        get: Effect.sync(() => globalThis.navigator.onLine),
        changes: Stream.concat(
            Stream.sync(() => globalThis.navigator.onLine),
            Stream.callback<boolean>(queue => Effect.acquireRelease(
                Effect.sync(() => {
                    const onlineListener = () => Queue.offerUnsafe(queue, true)
                    globalThis.window.addEventListener("online", onlineListener)
                    const offlineListener = () => Queue.offerUnsafe(queue, false)
                    globalThis.window.addEventListener("offline", offlineListener)

                    return [onlineListener, offlineListener] as const
                }),
                ([onlineListener, offlineListener]) => Effect.sync(() => {
                    globalThis.window.removeEventListener("online", onlineListener)
                    globalThis.window.removeEventListener("offline", offlineListener)
                }),
            )),
        ),
    })),
)
