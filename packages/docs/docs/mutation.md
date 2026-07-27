---
sidebar_position: 4
title: Mutation
---

# Mutation

The Mutation module is Effect View's counterpart to TanStack Query mutations.
It models user-triggered asynchronous work such as saving a profile, deleting a
record, uploading a file, or sending a command to an API.

The familiar concepts are present, but the operation itself is an Effect:

| TanStack Mutation concept | Effect View equivalent |
| --- | --- |
| Mutation variables | The input key `K` |
| `mutationFn` | `f: (key: K) => Effect<A, E, R>` |
| Mutation result | `mutation.state`, a `View<AsyncResult<A, E>>` |
| `isPending` | `result.waiting` |
| `mutateAsync` | `mutation.mutate(key)` |
| Start without awaiting | `mutation.mutateView(key)` |

Unlike a Query, a Mutation has no cache, reactive key, or automatic execution.
It runs only when `mutate` or `mutateView` is called. This makes it suitable for
commands, while Query remains the model for cached server state.

## Create a mutation

Create a mutation in a component scope with `Mutation.make`. Its function can
be any Effect, including one that requires services from the application
runtime:

`Mutation.make` is an Effect constructor, not a hook. Create each mutation
instance once and keep it stable instead of calling `Mutation.make` again on
every render. Use `Component.useOnMount` for a component-owned mutation or
create it in an Effect service when it should be shared.

```tsx
import { Effect } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { Component, Mutation, View } from "effect-view"
import { sendInvite } from "./api"

interface InviteInput {
  readonly email: string
  readonly role: "member" | "admin"
}

const InviteButtonView = Component.make("InviteButton")(
  function* (props: { readonly email: string }) {
    const mutation = yield* Component.useOnMount(() =>
      Mutation.make({
        f: (input: InviteInput) => sendInvite(input),
      }),
    )

    const [result] = yield* View.useAll([mutation.state])
    const runSync = yield* Component.useRunSync()

    return (
      <section>
        <button
          disabled={result.waiting}
          onClick={() =>
            runSync(mutation.mutateView({
              email: props.email,
              role: "member",
            }))
          }
        >
          {result.waiting ? "Sending..." : "Send invite"}
        </button>

        {AsyncResult.match(result, {
          onInitial: () => null,
          onFailure: ({ cause }) => (
            <p>Could not send invite: {cause.toString()}</p>
          ),
          onSuccess: ({ value }) => (
            <p>Invite sent to {value.email}</p>
          ),
        })}
      </section>
    )
  },
)
```

`Mutation.make` captures the current Effect context. If `sendInvite` requires
an HTTP client, authentication service, tracer, or another service, provide it
to the runtime or component layer before creating the mutation. The click
handler does not need to reconstruct those dependencies.

The mutation also belongs to the creation scope. Any mutation fibers still
running when that scope closes are interrupted automatically.

## Understand AsyncResult

`mutation.state` starts as `Initial` with `waiting: false`. Starting a mutation
changes it to a waiting state, then publishes either `Success` or `Failure`:

```tsx
const [result] = yield* View.useAll([mutation.state])

return AsyncResult.match(result, {
  onInitial: ({ waiting }) =>
    waiting ? <p>Starting...</p> : <p>Ready.</p>,
  onFailure: ({ cause, previousSuccess, waiting }) => (
    <div>
      <p>{cause.toString()}</p>
      {previousSuccess._tag === "Some" && (
        <p>Last saved value: {previousSuccess.value.value.name}</p>
      )}
      {waiting && <p>Trying again...</p>}
    </div>
  ),
  onSuccess: ({ value, waiting }) => (
    <div>
      <p>Saved {value.name}</p>
      {waiting && <p>Saving a newer value...</p>}
    </div>
  ),
})
```

The `waiting` flag is independent from the result tag. After one successful
call, starting another keeps the successful value and sets `waiting: true`.
If that next call fails, the failure can retain the earlier success in
`previousSuccess`. Components can therefore keep useful feedback visible
during retries or repeated submissions.

A failure contains an Effect `Cause<E>`, not only `E`. Typed failures, defects,
and interruption information remain available for logging or presentation.

## Choose mutate or mutateView

Both methods start the same mutation effect. They differ in what the caller
waits for:

| Method | Return value | Best suited to |
| --- | --- | --- |
| `mutate(key)` | The final `Success` or `Failure` | Effect workflows that need the outcome. |
| `mutateView(key)` | A live `View<AsyncResult<A, E>>` | UI callbacks that should return after starting the work. |

Use `mutate` with an asynchronous component runner when later logic depends on
the final result:

```tsx
const runPromise = yield* Component.useRunPromise()

const save = () =>
  void runPromise(
    Effect.gen(function* () {
      const result = yield* mutation.mutate(input)

      if (AsyncResult.isSuccess(result)) {
        yield* Effect.log(`Saved record ${result.value.id}`)
      }
    }),
  )
```

The mutation Effect does not fail with `E`. It captures the operation's `Exit`
and returns a final `AsyncResult.Success` or `AsyncResult.Failure`. Inspect or
match that value when control flow depends on the outcome.

Use `mutateView` when the UI only needs to start the operation and react to its
state:

```tsx
const runSync = yield* Component.useRunSync()

const startSave = () => {
  const state = runSync(mutation.mutateView(input))
  // `state` is a View for this specific call.
}
```

`mutateView` starts the scoped work and returns immediately with a per-call
View. The shared `mutation.state` is also updated as that call progresses.

## Track the latest call

In addition to `state`, a mutation exposes reactive metadata:

| Member | Meaning |
| --- | --- |
| `state` | The latest mutation state published to the shared View. |
| `latestKey` | The most recently supplied input as an `Option<K>`. |
| `latestFinalResult` | The latest completed success or failure as an `Option`. |
| `fiber` | The most recently started mutation fiber as an `Option`. |

Subscribe to any of them with `View.useAll`:

```tsx
const [result, latestInput, latestFinal] = yield* View.useAll([
  mutation.state,
  mutation.latestKey,
  mutation.latestFinalResult,
])
```

The input is called a `key` in the generic API, but it is equivalent to
mutation variables in TanStack Query. It can be a primitive, tuple, struct, or
any other value accepted by the mutation function.

## Concurrent mutations

Starting a mutation does not automatically interrupt an earlier mutation.
Calls may overlap, and each call has its own state View. This is useful for
independent operations such as uploading several files.

When calls overlap, `mutation.state` reflects updates published by all calls;
the last update to arrive wins. Use the View returned by `mutateView` when each
concurrent operation needs its own progress indicator:

```tsx
const upload = (file: File) =>
  Effect.gen(function* () {
    const uploadState = yield* mutation.mutateView(file)
    // Store or pass `uploadState` to the row rendering this file.
    return uploadState
  })
```

For a single submit button, disabling it while `mutation.state.waiting` is
usually enough to prevent accidental overlap. For “latest request wins”
behavior, model that policy explicitly or use Query when the operation is
actually a reactive read.

## Update queries after a mutation

Mutations do not invalidate Query caches automatically. Compose invalidation
with the mutation result so the relationship remains explicit and typed:

```tsx
const saveAndRefresh = (input: UpdatePostInput) =>
  Effect.gen(function* () {
    const result = yield* updatePost.mutate(input)

    if (AsyncResult.isSuccess(result)) {
      yield* posts.invalidateCacheEntry(["post", result.value.id] as const)
      yield* posts.refreshView
    }

    return result
  })
```

This is the Effect equivalent of an `onSuccess` callback that invalidates a
TanStack Query. Because it is ordinary Effect composition, the workflow can
also include tracing, transactions, retries, notifications, or parallel cache
updates without introducing a separate callback API.

Remember that Query invalidation removes cached data but does not refetch by
itself. Follow it with `refreshView` when the current screen should update
immediately.

## The Effect touch

Mutation follows the ergonomics of TanStack mutations while retaining Effect's
execution model:

- The mutation function has the full `Effect<A, E, R>` type.
- Required services are captured from the creation context.
- Failures are represented as `Cause<E>`, including defects and interruption.
- Fibers are scoped, so component unmounting cleans up in-flight operations.
- `mutate` composes directly inside larger Effect workflows.
- `mutateView` exposes call-specific progress as a View for React or Effect
  consumers.
- Retry schedules, timeouts, tracing, logging, metrics, schema validation, and
  concurrency controls can be applied with normal Effect operators.

Mutation is therefore a small bridge: TanStack-style mutation state on one
side, and an ordinary, typed Effect program on the other.
