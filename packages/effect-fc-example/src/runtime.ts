import { FetchHttpClient } from "@effect/platform"
import { Clipboard, Geolocation, Permissions } from "@effect/platform-browser"
import { DateTime, Layer } from "effect"
import { ReactRuntime } from "effect-fc"


export const AppLive = Layer.empty.pipe(
    Layer.provideMerge(DateTime.layerCurrentZoneLocal),
    Layer.provideMerge(Clipboard.layer),
    Layer.provideMerge(Geolocation.layer),
    Layer.provideMerge(Permissions.layer),
    Layer.provideMerge(FetchHttpClient.layer),
)

export const runtime = ReactRuntime.make(AppLive)
