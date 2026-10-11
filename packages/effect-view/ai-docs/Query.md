# Query

effect-view's take on TanStack Query: reactive query keys, cached results, stale times, background refresh, window-focus refetching, cache invalidation — but the query function is an `Effect` and the observable state is a `View` (see `State.md`).

| TanStack Query | effect-view |
|---|---|
| `QueryClient` | the `QueryClient` Effect service (below) |
| `queryKey` | a reactive key supplied as a `View<K>` |
| `queryFn` | `f: (key: K) => Effect<A, E, R>` |
| `useQuery` result | `query.state`, a `View<QueryState<K, A, E>>` |
| `isFetching` | `result.waiting` |
| `fetchStatus: 'paused'` | `state.paused` |
| `refetch` | `query.refresh` / `query.refreshStream` |
| `invalidateQueries` | `query.invalidateCache` / `invalidateCacheEntry` |
| `networkMode` | `networkMode` (`"online"` / `"offlineFirst"` / `"always"`) |
| `onlineManager` / `focusManager` | the `AppConnectivity` / `AppFocus` services |

## QueryClient: the shared cache

Every `Query` reads and writes through a `QueryClient`, the Effect service that owns the cache and its garbage collection. Add it once to the application runtime (browser):

```tsx
import { Layer } from "effect"
import { QueryClient, ReactRuntime } from "effect-view"

const appLayer = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layerBrowserWithOptions({
    defaultStaleTime: "30 seconds",     // default: "0 minutes"
    defaultRefreshOnFocus: true,        // default: true
    cacheGcTime: "5 minutes",           // default: "5 minutes"
  })),
)
export const runtime = ReactRuntime.make(appLayer)
```

`QueryClient.layer` (defaults) / `QueryClient.layerWithOptions(options)` build the service and fork its background garbage-collection loop into the layer's scope. Individual queries may override `staleTime`/`networkMode`/`refreshOnFocus`/`refreshOnReconnect`; unset options fall back to these client defaults (`defaultStaleTime`, `defaultNetworkMode`, `defaultRefreshOnFocus`, `defaultRefreshOnReconnect`); mutations use `defaultMutationNetworkMode` instead of `defaultNetworkMode`. `cacheGcTime` controls how long a stale, unaccessed cache entry is kept before eviction. They require the `AppConnectivity` and `AppFocus` services (see "Network mode and offline support"); `QueryClient.layerBrowser` / `QueryClient.layerBrowserWithOptions(options)` provide the browser implementations of both. You interact with the client only indirectly through `Query` instances — no need to call `QueryClientService` methods directly.

## Create and run a query

```tsx
import { Effect, Schema, SubscriptionRef } from "effect"
import { HttpClient } from "effect/http"
import { Component, Lens, Query, View } from "effect-view"

const [postId, query] = yield* Component.useOnMount(() =>
  Effect.gen(function* () {
    const key = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(["post", 1 as number] as const))

    const query = yield* Query.make({
      key,
      staleTime: "1 minute",
      f: ([, id]) =>
        HttpClient.HttpClient.pipe(
          Effect.andThen(client => client.get(`https://example.com/posts/${id}`)),
          Effect.andThen(res => res.json),
          Effect.andThen(Schema.decodeUnknownEffect(Post)),
        ),
    }).pipe(Query.thenRun)

    return [Lens.focusTupleAt(key, 1), query] as const
  }),
)
```

- `Query.make({ key, f, staleTime?, networkMode?, refreshOnFocus?, refreshOnReconnect?, keyEquivalence? })` constructs the query; `Query.thenRun` starts watching `key` in the current scope.
- Create each query once and keep it stable — the usual home is `Component.useOnMount` (component-owned) or an Effect service (shared across components). Change the key, don't recreate the query, when input changes.
- Keys use Effect equality by default (`keyEquivalence` overrides it). A tuple key plays the same role as `['post', id]` in TanStack Query.
- `f` keeps its full `Effect<A, E, R>` type: required services, schema decoding, retries, tracing all compose normally. The context is captured at creation time.
- Changing the key interrupts the previous in-flight request; a fresh cached success or a new run for the new key follows.

## Render AsyncResult

`query.state: View<QueryState<K, A, E>>` where `QueryState = { key: K; result: AsyncResult<A, E> }`.

```tsx
import { AsyncResult } from "effect/reactivity"

const [state] = yield* View.useAll([query.state])

AsyncResult.match(state.result, {
  onInitial: ({ waiting }) => waiting ? <p>Loading...</p> : <p>Not loaded.</p>,
  onFailure: ({ cause, previousSuccess, waiting }) => (/* cause: Cause<E>, previousSuccess: Option<Success> */),
  onSuccess: ({ value, waiting }) => (/* value: A, waiting: refreshing in background */),
})
```

`waiting` is independent of the result tag: a background refresh keeps a `Success` successful (with its value) while `waiting: true`; a failed refresh can retain `previousSuccess`. Failures carry a full `Cause<E>` (typed errors, defects, interruption), not just `E`.

## Refresh, fetch, invalidate

| Method | Behavior |
|---|---|
| `fetch(key)` | fetch a specific key, wait for its final state |
| `fetchStream(key)` | start fetching a key, return immediately with a `Stream` of that request's states (ends once it settles or is superseded) |
| `refresh` | resolve the current key again, wait for its final state |
| `refreshStream` | resolve the current key again, return immediately with a `Stream` of that request's states (ends once it settles or is superseded) |
| `invalidateCacheEntry(key)` | remove the cached success for one key |
| `invalidateCache` | remove every cached success for this query |

The `*Stream` variants suit synchronous UI callbacks (`runSync(query.refreshStream)`); the non-`Stream` variants suit Effect workflows waiting on the outcome. Each stream emits its request's current state first, so subscribing late still yields the final state. **Invalidating does not refetch by itself** — follow with `refresh`/`refreshStream`, a key change, or a later natural fetch.

```ts
import { Schedule } from "effect"

const query = yield* Query.make(options).pipe(
  Query.thenRun,
  Query.withScheduledRefresh(Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 }))),
)
```

`Query.withScheduledRefresh(schedule, options?)` forks a refresh fiber tied to the surrounding scope; cache/`staleTime` rules still apply. As with TanStack's `refetchInterval`, refreshes due while the app is not focused (`AppFocus`) are skipped (still counting as a schedule recurrence) unless `{ refreshInBackground: true }`.

## Staleness and lifetime

- `staleTime` (per query, falls back to `QueryClient` default): how long a successful result satisfies a fetch without re-running `f`. A stale entry stays available as previous data while it refreshes.
- `cacheGcTime` (on `QueryClient`): entries unused for `staleTime + cacheGcTime` are evicted.
- `refreshOnFocus` (per query, falls back to `QueryClient` default): re-resolves the current key when the app regains focus, as reported by the `AppFocus` service (page visibility, via the document's `visibilitychange` events, with `AppFocus.layerBrowser`). `true` refreshes only a stale result, `"always"` regardless of `staleTime` (type `Query.RefreshOn`).

## Network mode and offline support

- `networkMode: "online"` (default): a request waits for a connection before running `f`; meanwhile `state.paused` is `true` (with `result.waiting` still `true`). Paused requests can be superseded/interrupted like any other, which clears `paused`.
- `networkMode: "offlineFirst"`: runs `f` right away (e.g. served by a service worker / HTTP cache); if it fails while offline, the request is `paused` until the connection returns, then `f` runs again. A failure while online settles normally.
- `networkMode: "always"`: ignores the connection (for queries that don't use the network).
- `refreshOnReconnect` (defaults to the client default, `false` in `"always"` mode): re-resolves the current key when the connection returns, subject to freshness (`"always"`: regardless of `staleTime`). Focus/reconnect refreshes never restart an in-flight request (a paused one resumes by itself), as in TanStack Query.
- The connection comes from the `AppConnectivity` service (`navigator.onLine` + window `online`/`offline` events with `AppConnectivity.layerBrowser`). `AppConnectivity` and `AppFocus` are `Context.Service`s and must be provided to `QueryClient.layer`/`layerWithOptions` (the `layerBrowser*` variants do it for you).
- Each module has `layerBrowser` (`navigator.onLine` + `online`/`offline` events; page visibility), `layerDummy` (always online / always focused; tests, SSR) and `make(view: View<boolean>)` to build the service from any `View`, provided with `Layer.succeed`. A `View`'s `changes` stream starts with the current value.
- React Native: build them from platform APIs:

```ts
const appConnectivityLayer = Layer.succeed(
  AppConnectivity.AppConnectivity,
  AppConnectivity.make(View.make({
    get: Effect.map(Effect.promise(() => NetInfo.fetch()), state => !!state.isConnected),
    // NetInfo calls the listener with the current state right away
    changes: Stream.callback<boolean>(queue => Effect.acquireRelease(
      Effect.sync(() => NetInfo.addEventListener(state => Queue.offerUnsafe(queue, !!state.isConnected))),
      unsubscribe => Effect.sync(unsubscribe),
    )),
  })),
)

const appFocusLayer = Layer.succeed(
  AppFocus.AppFocus,
  AppFocus.make(View.make({
    get: Effect.sync(() => AppState.currentState === "active"),
    changes: Stream.concat(
      Stream.sync(() => AppState.currentState === "active"),
      Stream.callback<boolean>(queue => Effect.acquireRelease(
        Effect.sync(() => AppState.addEventListener("change", status => Queue.offerUnsafe(queue, status === "active"))),
        subscription => Effect.sync(() => subscription.remove()),
      )),
    ),
  })),
)

const appLayer = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layer),
  Layer.provideMerge(appConnectivityLayer),
  Layer.provideMerge(appFocusLayer),
)
```

## The Effect touch

Request fibers belong to the creation scope and are interrupted on unmount, key replacement, or scope closure. A `fetch`/`refresh` superseded by a newer request is interrupted (it does not return a result), and the interrupted request's state stops waiting. Results are `View`s usable outside React too. Mutations do not auto-invalidate queries — compose it explicitly (see `Mutation.md`).
