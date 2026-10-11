---
sidebar_position: 3
title: Query
---

# Query

The Query module is Effect View's take on TanStack Query. It provides the same
kind of server-state workflow—reactive query keys, cached results, stale times,
background refreshes, window-focus refetching, and cache invalidation—but the
query function is an `Effect` and the observable state is a `View`.

If you already know TanStack Query, the main concepts translate directly:

| TanStack Query concept | Effect View equivalent |
| --- | --- |
| `QueryClient` | The `QueryClient` Effect service |
| `queryKey` | A reactive key supplied as a `View<K>` |
| `queryFn` | `f: (key: K) => Effect<A, E, R>` |
| `useQuery` result | `query.state`, a `View<QueryState<K, A, E>>` |
| `isFetching` | `result.waiting` |
| `fetchStatus: 'paused'` | `state.paused` |
| `refetch` | `query.refresh` or `query.refreshStream` |
| `invalidateQueries` | `query.invalidateCache` or `invalidateCacheEntry` |
| `networkMode` | `networkMode` (`"online"`, `"offlineFirst"` or `"always"`) |
| `onlineManager` | The `AppConnectivity` service |
| `focusManager` | The `AppFocus` service |

The goal is familiar query behavior without leaving Effect's model. Query
functions keep their typed success, error, and service channels. They can use
services from the runtime, be composed with schema decoding and retry policies,
and are interrupted automatically when their scope ends or a new key supersedes
the current request. A `fetch` or `refresh` that a newer request supersedes is
interrupted as well, rather than returning a result.

## Provide a QueryClient

Queries share successful results through a `QueryClient`. Add its layer to the
application runtime once, alongside the services used by your query effects. In
a browser, use `QueryClient.layerBrowser`, or `QueryClient.layerBrowserWithOptions`
to change the defaults:

```tsx title="src/runtime.ts"
import { Layer } from "effect"
import { QueryClient, ReactRuntime } from "effect-view"

const layer = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layerBrowserWithOptions({
    defaultStaleTime: "30 seconds",
    defaultRefreshOnFocus: true,
    cacheGcTime: "5 minutes",
  })),
)

export const runtime = ReactRuntime.make(layer)
```

The client owns the cache and its cleanup lifecycle. Individual queries can
override `staleTime`, `networkMode`, `refreshOnFocus` and
`refreshOnReconnect`; otherwise they inherit the client defaults
(`defaultStaleTime`, `defaultNetworkMode`, `defaultRefreshOnFocus` and
`defaultRefreshOnReconnect`).

The client needs to know whether the app is focused and online, which it gets
from the `AppFocus` and `AppConnectivity` services. The browser layers provide
both from the window's events. `QueryClient.layer` and
`QueryClient.layerWithOptions` leave them for you to provide, for example on
other platforms such as [React Native](#react-native).

## Create a reactive query

A query is driven by a `View` rather than by a value read during one React
render. Whenever that key changes, a running Query checks the cache and starts
the query effect when necessary.

`Query.make` constructs the Query and `Query.thenRun` starts it in the current
scope. Create each query instance once and keep it stable. In a component, the usual place is
`Component.useOnMount`; a query shared by multiple components can instead be
owned by an Effect service. Change the existing query's reactive key rather
than reconstructing the query during render.

```tsx
import { Effect, Schema, SubscriptionRef } from "effect"
import { HttpClient } from "effect/http"
import { Component, Lens, Query, View } from "effect-view"

const Post = Schema.Struct({
  id: Schema.Int,
  title: Schema.String,
  body: Schema.String,
})

const PostView = Component.make("Post")(function* () {
  const [postId, query] = yield* Component.useOnMount(() =>
    Effect.gen(function* () {
      const key = Lens.fromSubscriptionRef(
        yield* SubscriptionRef.make(["post", 1 as number] as const),
      )

      const query = yield* Query.make({
        key,
        staleTime: "1 minute",
        f: ([, id]) =>
          HttpClient.HttpClient.pipe(
            Effect.andThen((client) =>
              client.get(`https://example.com/posts/${id}`),
            ),
            Effect.andThen((response) => response.json),
            Effect.andThen(Schema.decodeUnknownEffect(Post)),
          ),
      }).pipe(Query.thenRun)

      return [Lens.focusTupleAt(key, 1), query] as const
    }),
  )

  const [state] = yield* View.useAll([query.state])
  const [id, setId] = yield* Lens.useState(postId)

  return (
    <section>
      <select
        value={id}
        onChange={(event) => setId(Number(event.currentTarget.value))}
      >
        <option value={1}>Post 1</option>
        <option value={2}>Post 2</option>
      </select>
      <pre>{state.result._tag}</pre>
    </section>
  )
})
```

The tuple key plays the same role as `['post', id]` in TanStack Query. Keys use
Effect equality by default, so structurally equal Effect data types work well
as query keys. Supply `keyEquivalence` when the key needs different equality
semantics.

`Query.thenRun` starts watching its key in the current scope. The
`Component.useOnMount` call above keeps both the query instance and its query
function identity stable for the component's lifetime.

## Render AsyncResult

`query.state` contains both the current key and an `AsyncResult`:

```ts
interface QueryState<K, A, E> {
  readonly key: K
  readonly result: AsyncResult.AsyncResult<A, E>
}
```

Subscribe with `View.useAll`, then match the result explicitly:

```tsx
import { AsyncResult } from "effect/reactivity"

const [state] = yield* View.useAll([query.state])

return AsyncResult.match(state.result, {
  onInitial: ({ waiting }) =>
    waiting ? <p>Loading...</p> : <p>Not loaded.</p>,
  onFailure: ({ cause, previousSuccess, waiting }) => (
    <section>
      <p>Request failed: {cause.toString()}</p>
      {previousSuccess._tag === "Some" && (
        <p>Last post: {previousSuccess.value.value.title}</p>
      )}
      {waiting && <p>Trying again...</p>}
    </section>
  ),
  onSuccess: ({ value, waiting }) => (
    <article>
      {waiting && <small>Refreshing...</small>}
      <h2>{value.title}</h2>
      <p>{value.body}</p>
    </article>
  ),
})
```

The `waiting` flag separates “do I have a result?” from “is work currently in
flight?”. During a background refresh, a successful result remains successful
and keeps its value while `waiting` becomes `true`. A failed refresh can retain
its `previousSuccess`. This avoids replacing useful content with an empty
loading screen every time data is refreshed.

Failures contain an Effect `Cause<E>`, preserving typed failures, defects, and
interruption information instead of flattening everything into an untyped
exception.

## Change the query key

The key is reactive state, so changing it is enough to fetch the corresponding
resource. There is no separate dependency array to keep synchronized:

```tsx
const [id, setId] = yield* Lens.useState(postId)

return (
  <label>
    Post
    <select
      value={id}
      onChange={(event) => setId(Number(event.currentTarget.value))}
    >
      <option value={1}>1</option>
      <option value={2}>2</option>
      <option value={3}>3</option>
    </select>
  </label>
)
```

When the key changes, the previous in-flight request is interrupted. The query
then reuses a fresh cached success or starts the effect for the new key.

## Refresh and invalidate

Refresh resolves the latest key again. A fresh cached result can satisfy it
immediately; a stale or missing result runs the query effect while preserving
previous data as background state. Invalidation removes cached data, so the
next fetch for that key must run the effect again.

```tsx
const runSync = yield* Component.useRunSync()

return (
  <div>
    <button onClick={() => runSync(query.refreshStream)}>
      Refresh current post
    </button>
    <button onClick={() => runSync(query.invalidateCacheEntry(["post", id] as const))}>
      Invalidate current post
    </button>
    <button onClick={() => runSync(query.invalidateCache)}>
      Invalidate all posts from this query
    </button>
  </div>
)
```

The methods come in two styles:

| Method | Behavior |
| --- | --- |
| `fetch(key)` | Fetch a specific key and wait for its final state. |
| `fetchStream(key)` | Start fetching and immediately return a `Stream` of the request's states, ending once it settles. |
| `refresh` | Resolve the current key again and wait for its final state. |
| `refreshStream` | Resolve the current key again and immediately return a `Stream` of the request's states, ending once it settles. |
| `invalidateCacheEntry(key)` | Remove the cached success for one key. |
| `invalidateCache` | Remove every cached success associated with this query function. |

The `*Stream` variants are convenient in synchronous UI callbacks: they return
after the scoped request has started. The returned stream emits the request's
current state, then each change, and ends once the request settles or is
superseded; `query.state` keeps publishing progress either way. The non-Stream
variants are useful in Effect workflows that need to wait for the final success
or failure state.

Invalidating does not itself refetch. Follow it with `refresh` or `refreshStream`, change the
key, or allow a later fetch to repopulate the cache.

### Refresh on an interval

Refresh every five minutes, starting after five minutes:

```ts
import { Schedule } from "effect"

const query = yield* Query.make(options).pipe(
  Query.thenRun,
  Query.withScheduledRefresh(Schedule.spaced("5 minutes")),
)
```

Limit the number of refreshes:

```ts
const query = yield* Query.make(options).pipe(
  Query.thenRun,
  Query.withScheduledRefresh(
    Schedule.spaced("5 minutes").pipe(
      Schedule.upTo({ times: 3 }),
    ),
  ),
)
```

The refresh fiber stops with the surrounding scope. The Effect returns the
original query. Cache and `staleTime` rules still apply.

Like TanStack Query's `refetchInterval`, scheduled refreshes are skipped while
the app is not focused, as reported by the `AppFocus` service. A skipped
refresh still counts toward the schedule. Pass `refreshInBackground: true` to
keep refreshing in the background:

```ts
const query = yield* Query.make(options).pipe(
  Query.thenRun,
  Query.withScheduledRefresh(Schedule.spaced("5 minutes"), { refreshInBackground: true }),
)
```

## Staleness and cache lifetime

`staleTime` controls how long a successful result can satisfy a fetch without
running the effect again. A stale entry remains available as previous data
while the query refreshes it.

`cacheGcTime` is configured on `QueryClient`. Entries that have not been
accessed are eventually removed after their stale period plus the configured
garbage-collection time.

By default, the client enables refresh when the app regains focus. Set it
globally or override it for one query:

```tsx
const query = yield* Query.make({
  key,
  f: loadPost,
  staleTime: "10 seconds",
  refreshOnFocus: false,
}).pipe(Query.thenRun)
```

Regaining focus resolves the current key again, subject to the same freshness
check. Set `refreshOnFocus: "always"` to refresh even when the result is still
fresh. Focus comes from the `AppFocus` service: with
`QueryClient.layerBrowser` the app is focused while the page is visible,
following the document's `visibilitychange` events, like TanStack Query.
Other platforms, such as React Native, provide it themselves, as shown in
[React Native](#react-native).

## Network mode and offline support

A query's `networkMode` decides how it behaves without a network connection:

| `networkMode` | Behavior |
| --- | --- |
| `"online"` (default) | A request waits for a connection before running `f`. Meanwhile its state is `paused`, with `result.waiting` still `true`. |
| `"offlineFirst"` | A request runs right away, e.g. to be served by a service worker or HTTP cache. If it fails while offline, it is `paused` until the connection returns, then runs again. |
| `"always"` | Requests ignore the connection. Suited to queries that do not use the network. |

Use `state.paused` to tell "loading" apart from "waiting for a connection":

```tsx
const [state] = yield* View.useAll([query.state])

if (state.paused) return <p>Offline. Waiting for a connection…</p>
```

With `refreshOnReconnect` (enabled by default, except in `"always"` mode),
regaining the connection resolves the current key again, subject to the usual
freshness check. Set it to `"always"` to refresh even when the result is still
fresh. Like TanStack Query, focus and reconnect refreshes never restart a
request that is already in flight: a running request keeps running, and one
paused for lack of a connection resumes on its own. A paused request can still
be superseded or interrupted like any other.

The connection status comes from the `AppConnectivity` service. With
`QueryClient.layerBrowser` it follows `navigator.onLine` and the window's
`online`/`offline` events.

### Provide AppConnectivity and AppFocus

Outside a browser, use `QueryClient.layer` and provide both services yourself.
Each module offers:

| Layer or function | Behavior |
| --- | --- |
| `layerBrowser` | Follows the browser: `navigator.onLine` with the `online`/`offline` events, and the page's visibility. |
| `layerDummy` | Always online, or always focused. Useful for tests and server rendering. |
| `make(view)` | Builds the service from a `View<boolean>`, to provide with `Layer.succeed`. |

```tsx
import { Layer } from "effect"
import { AppConnectivity, AppFocus, QueryClient } from "effect-view"

const queryClientLayer = QueryClient.layer.pipe(
  Layer.provide(Layer.mergeAll(AppConnectivity.layerDummy, AppFocus.layerDummy)),
)
```

### React Native

React Native has neither window focus nor `online`/`offline` events. Build
both services from the platform APIs with `make`, and provide them to
`QueryClient.layer`:

```tsx title="src/runtime.ts"
import NetInfo from "@react-native-community/netinfo"
import { Effect, Layer, Queue, Stream } from "effect"
import { AppConnectivity, AppFocus, QueryClient, ReactRuntime, View } from "effect-view"
import { AppState } from "react-native"

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

const layer = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layer),
  Layer.provideMerge(appConnectivityLayer),
  Layer.provideMerge(appFocusLayer),
)

export const runtime = ReactRuntime.make(layer)
```

A service's `changes` stream starts with the current value, and the listeners
are removed when the layer is released.

## The Effect touch

The API emulates TanStack Query's server-state ergonomics, but query execution
remains ordinary Effect code:

- `f` has the full `Effect<A, E, R>` type, including required services.
- The query captures its Effect context when it is created, so callbacks do not
  need to manually reconstruct dependencies.
- Effects can use `Schema`, retry schedules, tracing, logging, metrics,
  cancellation, and any other Effect operator before becoming query state.
- Request fibers belong to the creation scope and are interrupted on unmount,
  key replacement, or scope closure.
- Results are `View`s, so the same state can drive React through `View.useAll`
  or participate in Effect streams and application logic outside React.
- Failures retain `Cause<E>` rather than losing Effect's error model.

`Query` is therefore best understood as a TanStack Query-shaped coordinator
for Effect programs: it handles when and whether to run them, while Effect
continues to describe what the work requires and how it behaves.
