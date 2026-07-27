import { Clipboard, Geolocation, Permissions } from "@effect/platform-browser"
import { DateTime, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { QueryClient, ReactRuntime } from "effect-view"


export const layer = Layer.empty.pipe(
    Layer.provideMerge(QueryClient.layer()),
    Layer.provideMerge(DateTime.layerCurrentZoneLocal),
    Layer.provideMerge(Clipboard.layer),
    Layer.provideMerge(Geolocation.layer),
    Layer.provideMerge(Permissions.layer),
    Layer.provideMerge(FetchHttpClient.layer),
)

export const runtime = ReactRuntime.make(layer)
