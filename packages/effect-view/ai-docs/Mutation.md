# Mutation

effect-view's counterpart to TanStack Query mutations: user-triggered asynchronous work (save, delete, upload, send) as an Effect. No cache, no reactive key, no automatic execution — it runs only when called.

| TanStack Mutation | effect-view |
|---|---|
| mutation variables | the input key `K` |
| `mutationFn` | `f: (key: K) => Effect<A, E, R>` |
| mutation result | `mutation.state`, a `View<{ key: Option<K>; result: AsyncResult<A, E> }>` |
| `isPending` | `state.result.waiting` |
| `mutateAsync` | `mutation.mutate(key)` |
| start without awaiting | `mutation.mutateStream(key)` |

## Create

```tsx
import { Mutation } from "effect-view"

const mutation = yield* Component.useOnMount(() =>
  Mutation.make({ f: (input: InviteInput) => sendInvite(input) }),
)
```

`Mutation.make({ f })` is an Effect constructor, not a hook — create each instance once (`Component.useOnMount` for component-owned, an Effect service for shared) and keep it stable. `f` keeps its full `Effect<A, E, R>` type; required services are captured from the creation context, so callbacks don't reconstruct dependencies. Fibers belong to the creation scope and are interrupted if that scope closes while running.

## AsyncResult state

`mutation.state` is a `View` of `{ key: Option<K>, result: AsyncResult<A, E> }`. `result` starts `Initial` (`waiting: false`); calling `mutate`/`mutateStream` sets `waiting: true`, then publishes `Success` or `Failure`. Match on `state.result`, not `state` itself:

```tsx
import { AsyncResult } from "effect/reactivity"

const [state] = yield* View.useAll([mutation.state])

AsyncResult.match(state.result, {
  onInitial: ({ waiting }) => (...),
  onFailure: ({ cause, previousSuccess, waiting }) => (...), // cause: Cause<E>
  onSuccess: ({ value, waiting }) => (...),
})
```

`waiting` is independent of the result tag: after one success, starting another call keeps the value visible while `waiting: true`; if that call fails, the failure can retain `previousSuccess`. Failures carry a full `Cause<E>`.

## mutate vs mutateStream

| Method | Returns | Use for |
|---|---|---|
| `mutate(key)` | the final `MutationFinalState` (`{ key: Option.Some<K>, result: Success \| Failure }`) | an Effect workflow that needs the outcome |
| `mutateStream(key)` | a per-call `Stream<{ key: Option.Some<K>, result: AsyncResult<A, E> }>` of the call's states, starting with the current one and ending once it settles | a UI callback that just starts the work |

```tsx
const runPromise = yield* Component.useRunPromise()
void runPromise(Effect.gen(function* () {
  const final = yield* mutation.mutate(input)
  if (AsyncResult.isSuccess(final.result)) yield* Effect.log(`Saved ${final.result.value.id}`)
}))
```

```tsx
const runSync = yield* Component.useRunSync()
const states = runSync(mutation.mutateStream(input)) // a Stream for this specific call; consume with `Stream.use`
```

The mutation Effect never fails with `E` itself — it captures the operation's `Exit` and always resolves to a final state wrapping an `AsyncResult.Success`/`Failure`.

## Reactive metadata

| Member | Meaning |
|---|---|
| `state` | latest mutation state, shared `View` |
| `latestKey` | most recent input, `Option<K>` |
| `latestFinalState` | latest completed final state, `Option<MutationFinalState<K, A, E>>` |
| `operation` | most recently started call, `Option<Operation>` (key, state, `fiber`, `interrupt`) |

## Concurrency

Starting a mutation does not interrupt an earlier one — calls can overlap, each with its own `mutateStream` stream; `mutation.state` (and `latestFinalState`) follow only the most recently started call; earlier calls still run to completion but no longer update them. For a single submit button, disabling while `result.waiting` is usually enough. Use per-call `mutateStream` streams (e.g. per uploaded file) when concurrent operations each need their own progress indicator.

## Updating queries after a mutation

Mutations never auto-invalidate `Query` caches — compose it explicitly:

```tsx
const final = yield* updatePost.mutate(input)
if (AsyncResult.isSuccess(final.result)) {
  yield* posts.invalidateCacheEntry(["post", final.result.value.id] as const)
  yield* posts.refresh // invalidation alone does not refetch
}
```
