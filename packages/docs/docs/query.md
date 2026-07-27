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
| `refetch` | `query.refresh` or `query.refreshView` |
| `invalidateQueries` | `query.invalidateCache` or `invalidateCacheEntry` |

The goal is familiar query behavior without leaving Effect's model. Query
functions keep their typed success, error, and service channels. They can use
services from the runtime, be composed with schema decoding and retry policies,
and are interrupted automatically when their scope ends or a new key supersedes
the current request.

## Provide a QueryClient

Queries share successful results through a `QueryClient`. Add its layer to the
application runtime once, alongside the services used by your query effects:

```tsx title="src/runtime.ts"
import { Layer } from "effect"
import { QueryClient, ReactRuntime } from "effect-view"

const AppLive = Layer.empty.pipe(
  Layer.provideMerge(QueryClient.layer({
    defaultStaleTime: "30 seconds",
    defaultRefreshOnWindowFocus: true,
    cacheGcTime: "5 minutes",
  })),
)

export const runtime = ReactRuntime.make(AppLive)
```

The client owns the cache and its cleanup lifecycle. Individual queries can
override `staleTime` and `refreshOnWindowFocus`; otherwise they inherit the
client defaults. Window-focus refresh also requires the optional
`@effect/platform-browser` package, as described under
[Staleness and cache lifetime](#staleness-and-cache-lifetime).

## Create a reactive query

A query is driven by a `View` rather than by a value read during one React
render. Whenever that key changes, `Query.service` checks the cache and starts
the query effect when necessary.

`Query.service` is an Effect constructor, not a hook. Create each query instance
once and keep it stable. In a component, the usual place is
`Component.useOnMount`; a query shared by multiple components can instead be
owned by an Effect service. Change the existing query's reactive key rather
than reconstructing the query during render.

```tsx
import { Effect, Schema, SubscriptionRef } from "effect"
import { HttpClient } from "effect/unstable/http"
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

      const query = yield* Query.service({
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
      })

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

`Query.service` starts watching its key in the current scope. The
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
import { AsyncResult } from "effect/unstable/reactivity"

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
    <button onClick={() => runSync(query.refreshView)}>
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
| `fetchView(key)` | Start fetching and immediately return a live state `View`. |
| `refresh` | Resolve the current key again and wait for its final state. |
| `refreshView` | Resolve the current key again and immediately return a live state `View`. |
| `invalidateCacheEntry(key)` | Remove the cached success for one key. |
| `invalidateCache` | Remove every cached success associated with this query function. |

The `*View` variants are convenient in synchronous UI callbacks: they return
after the scoped request has started, while the returned View and `query.state`
continue to publish progress. The non-View variants are useful in Effect
workflows that need to wait for the final success or failure state.

Invalidating does not itself refetch. Follow it with `refreshView`, change the
key, or allow a later fetch to repopulate the cache.

## Staleness and cache lifetime

`staleTime` controls how long a successful result can satisfy a fetch without
running the effect again. A stale entry remains available as previous data
while the query refreshes it.

`cacheGcTime` is configured on `QueryClient`. Entries that have not been
accessed are eventually removed after their stale period plus the configured
garbage-collection time.

By default, the client enables refresh on browser window focus. Set it globally
or override it for one query:

```tsx
const query = yield* Query.service({
  key,
  f: loadPost,
  staleTime: "10 seconds",
  refreshOnWindowFocus: false,
})
```

Window-focus refresh depends on the optional `@effect/platform-browser`
integration. Install it in browser applications that use this behavior:

```bash npm2yarn
npm install @effect/platform-browser@beta
```

When the package is available, focusing the window resolves the current key
again, subject to the same freshness check. Without it,
`refreshOnWindowFocus` has no effect; the rest of the Query API continues to
work normally. The integration is also ignored in non-browser environments.

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
