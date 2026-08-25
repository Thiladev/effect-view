# Query

effect-view's take on TanStack Query: reactive query keys, cached results, stale times, background refresh, window-focus refetching, cache invalidation — but the query function is an `Effect` and the observable state is a `View` (see `State.md`).

| TanStack Query | effect-view |
|---|---|
| `QueryClient` | the `QueryClient` Effect service (below) |
| `queryKey` | a reactive key supplied as a `View<K>` |
| `queryFn` | `f: (key: K) => Effect<A, E, R>` |
| `useQuery` result | `query.state`, a `View<QueryState<K, A, E>>` |
| `isFetching` | `result.waiting` |
| `refetch` | `query.refresh` / `query.refreshView` |
| `invalidateQueries` | `query.invalidateCache` / `invalidateCacheEntry` |

## QueryClient: the shared cache

Every `Query` reads and writes through a `QueryClient`, the Effect service that owns the cache and its garbage collection. Add it once to the application runtime:

```tsx
import { Layer } from "effect"
import { QueryClient, ReactRuntime } from "effect-view"

const AppLive = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layer({
    defaultStaleTime: "30 seconds",     // default: "0 minutes"
    defaultRefreshOnWindowFocus: true,  // default: true
    cacheGcTime: "5 minutes",           // default: "5 minutes"
  })),
)
export const runtime = ReactRuntime.make(AppLive)
```

`QueryClient.layer(options?)` builds the service and forks its background garbage-collection loop into the layer's scope. Individual queries may override `staleTime`/`refreshOnWindowFocus`; unset options fall back to these client defaults. `cacheGcTime` controls how long a stale, unaccessed cache entry is kept before eviction. You interact with the client only indirectly through `Query` instances — no need to call `QueryClientService` methods directly.

## Create and run a query

```tsx
import { Effect, Schema, SubscriptionRef } from "effect"
import { HttpClient } from "effect/unstable/http"
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

- `Query.make({ key, f, staleTime?, refreshOnWindowFocus?, keyEquivalence? })` constructs the query; `Query.thenRun` starts watching `key` in the current scope.
- Create each query once and keep it stable — the usual home is `Component.useOnMount` (component-owned) or an Effect service (shared across components). Change the key, don't recreate the query, when input changes.
- Keys use Effect equality by default (`keyEquivalence` overrides it). A tuple key plays the same role as `['post', id]` in TanStack Query.
- `f` keeps its full `Effect<A, E, R>` type: required services, schema decoding, retries, tracing all compose normally. The context is captured at creation time.
- Changing the key interrupts the previous in-flight request; a fresh cached success or a new run for the new key follows.

## Render AsyncResult

`query.state: View<QueryState<K, A, E>>` where `QueryState = { key: K; result: AsyncResult<A, E> }`.

```tsx
import { AsyncResult } from "effect/unstable/reactivity"

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
| `fetchView(key)` | start fetching a key, return immediately as a live state `View` |
| `refresh` | resolve the current key again, wait for its final state |
| `refreshView` | resolve the current key again, return immediately as a live `View` |
| `invalidateCacheEntry(key)` | remove the cached success for one key |
| `invalidateCache` | remove every cached success for this query |

The `*View` variants suit synchronous UI callbacks (`runSync(query.refreshView)`); the non-`View` variants suit Effect workflows waiting on the outcome. **Invalidating does not refetch by itself** — follow with `refreshView`, a key change, or a later natural fetch.

```ts
import { Schedule } from "effect"

const query = yield* Query.make(options).pipe(
  Query.thenRun,
  Query.withScheduledRefresh(Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 }))),
)
```

`Query.withScheduledRefresh(schedule)` forks a refresh fiber tied to the surrounding scope; cache/`staleTime` rules still apply.

## Staleness and lifetime

- `staleTime` (per query, falls back to `QueryClient` default): how long a successful result satisfies a fetch without re-running `f`. A stale entry stays available as previous data while it refreshes.
- `cacheGcTime` (on `QueryClient`): entries unused for `staleTime + cacheGcTime` are evicted.
- `refreshOnWindowFocus` (per query, falls back to `QueryClient` default): re-resolves the current key on window focus. Requires the optional `@effect/platform-browser` package; without it, the option is silently ignored (rest of the API works normally). Also a no-op outside browser environments.

## The Effect touch

Request fibers belong to the creation scope and are interrupted on unmount, key replacement, or scope closure. Results are `View`s usable outside React too. Mutations do not auto-invalidate queries — compose it explicitly (see `Mutation.md`).
