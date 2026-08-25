# Mutation

effect-view's counterpart to TanStack Query mutations: user-triggered asynchronous work (save, delete, upload, send) as an Effect. No cache, no reactive key, no automatic execution — it runs only when called.

| TanStack Mutation | effect-view |
|---|---|
| mutation variables | the input key `K` |
| `mutationFn` | `f: (key: K) => Effect<A, E, R>` |
| mutation result | `mutation.state`, a `View<{ key: Option<K>; result: AsyncResult<A, E> }>` |
| `isPending` | `state.result.waiting` |
| `mutateAsync` | `mutation.mutate(key)` |
| start without awaiting | `mutation.mutateView(key)` |

## Create

```tsx
import { Mutation } from "effect-view"

const mutation = yield* Component.useOnMount(() =>
  Mutation.make({ f: (input: InviteInput) => sendInvite(input) }),
)
```

`Mutation.make({ f })` is an Effect constructor, not a hook — create each instance once (`Component.useOnMount` for component-owned, an Effect service for shared) and keep it stable. `f` keeps its full `Effect<A, E, R>` type; required services are captured from the creation context, so callbacks don't reconstruct dependencies. Fibers belong to the creation scope and are interrupted if that scope closes while running.

## AsyncResult state

`mutation.state` is a `View` of `{ key: Option<K>, result: AsyncResult<A, E> }`. `result` starts `Initial` (`waiting: false`); calling `mutate`/`mutateView` sets `waiting: true`, then publishes `Success` or `Failure`. Match on `state.result`, not `state` itself:

```tsx
import { AsyncResult } from "effect/unstable/reactivity"

const [state] = yield* View.useAll([mutation.state])

AsyncResult.match(state.result, {
  onInitial: ({ waiting }) => (...),
  onFailure: ({ cause, previousSuccess, waiting }) => (...), // cause: Cause<E>
  onSuccess: ({ value, waiting }) => (...),
})
```

`waiting` is independent of the result tag: after one success, starting another call keeps the value visible while `waiting: true`; if that call fails, the failure can retain `previousSuccess`. Failures carry a full `Cause<E>`.

## mutate vs mutateView

| Method | Returns | Use for |
|---|---|---|
| `mutate(key)` | the final `FinalMutationState` (`{ key: Option.Some<K>, result: Success \| Failure }`) | an Effect workflow that needs the outcome |
| `mutateView(key)` | a live per-call `View<{ key: Option.Some<K>, result: AsyncResult<A, E> }>` | a UI callback that just starts the work |

```tsx
const runPromise = yield* Component.useRunPromise()
void runPromise(Effect.gen(function* () {
  const final = yield* mutation.mutate(input)
  if (AsyncResult.isSuccess(final.result)) yield* Effect.log(`Saved ${final.result.value.id}`)
}))
```

```tsx
const runSync = yield* Component.useRunSync()
const state = runSync(mutation.mutateView(input)) // a View for this specific call
```

The mutation Effect never fails with `E` itself — it captures the operation's `Exit` and always resolves to a final state wrapping an `AsyncResult.Success`/`Failure`.

## Reactive metadata

| Member | Meaning |
|---|---|
| `state` | latest mutation state, shared `View` |
| `latestKey` | most recent input, `Option<K>` |
| `latestFinalState` | latest completed final state, `Option<FinalMutationState<K, A, E>>` |
| `fiber` | most recently started mutation fiber, `Option` |

## Concurrency

Starting a mutation does not interrupt an earlier one — calls can overlap, each with its own `mutateView` state; `mutation.state` reflects whichever update arrived last. For a single submit button, disabling while `result.waiting` is usually enough. Use per-call `mutateView` Views (e.g. per uploaded file) when concurrent operations each need their own progress indicator.

## Updating queries after a mutation

Mutations never auto-invalidate `Query` caches — compose it explicitly:

```tsx
const final = yield* updatePost.mutate(input)
if (AsyncResult.isSuccess(final.result)) {
  yield* posts.invalidateCacheEntry(["post", final.result.value.id] as const)
  yield* posts.refreshView // invalidation alone does not refetch
}
```
