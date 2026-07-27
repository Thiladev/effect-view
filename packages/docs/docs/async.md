---
sidebar_position: 2
title: Async
---

# Async

Effect View components run synchronously by default. Apply `Async.async` when a
component must wait for an asynchronous Effect before it can return JSX. The
component suspends while the Effect runs and accepts React Suspense props such
as `fallback`.

```tsx title="src/UserCard.tsx"
import { Effect } from "effect"
import { Async, Component } from "effect-view"
import { loadUser } from "./api"

export const UserCard = Component.make("UserCard")(
  function* ({ userId }: { readonly userId: string }) {
    const user = yield* Component.useOnChange(
      () => loadUser(userId),
      [userId],
    )

    return <article>{user.name}</article>
  },
).pipe(Async.async)
```

Pass a fallback when rendering the component:

```tsx
const User = yield* UserCard.use

return <User userId="123" fallback={<p>Loading user...</p>} />
```

Or configure a default fallback once:

```tsx
export const UserCard = Component.make("UserCard")(
  function* ({ userId }: { readonly userId: string }) {
    const user = yield* Component.useOnChange(
      () => loadUser(userId),
      [userId],
    )

    return <article>{user.name}</article>
  },
).pipe(
  Async.async,
  Async.withOptions({ defaultFallback: <p>Loading user...</p> }),
)
```

## Hook ordering

**Important:** Do not use React hooks or Effect View hook helpers after an
asynchronous computation in the component body. After the computation suspends,
the generator continuation runs outside React's synchronous render phase.

Place every hook before the first operation that may suspend:

```tsx
import { useState } from "react"

const UserCard = Component.make("UserCard")(
  function* ({ userId }: { readonly userId: string }) {
    // Hooks and hook helpers go before asynchronous work.
    const [showDetails, setShowDetails] = useState(false)

    // This may suspend, so no hooks may be used after it.
    const user = yield* Component.useOnChange(
      () => loadUser(userId),
      [userId],
    )

    return (
      <article>
        <button onClick={() => setShowDetails((value) => !value)}>
          {user.name}
        </button>
        {showDetails && <p>{user.bio}</p>}
      </article>
    )
  },
).pipe(Async.async)
```

## Memoization

An async computation starts whenever its component renders. Apply
`Memoized.memoized` after `Async.async` to prevent an unrelated parent render
from restarting an async child whose props have not changed:

```tsx
import { Async, Component, Memoized } from "effect-view"

export const UserCard = Component.make("UserCard")(
  function* ({ userId }: { readonly userId: string }) {
    const user = yield* Component.useOnChange(
      () => loadUser(userId),
      [userId],
    )

    return <article>{user.name}</article>
  },
).pipe(
  Async.async,
  Memoized.memoized,
)
```

Async components compare props with `Object.is` by default and ignore the
`fallback` prop during that comparison. A changed `userId` renders the child
again, closes the previous dependency scope, and runs `loadUser` for the new
value.

If props contain immutable objects or arrays that may be recreated with the same
content, use `Equal.asEquivalence()` for full structural equality:

```tsx
import { Equal } from "effect"
import { Async, Component, Memoized } from "effect-view"

export const UserCard = Component.make("UserCard")(
  function* (props: { readonly user: { readonly id: string } }) {
    const details = yield* Component.useOnChange(
      () => loadUser(props.user.id),
      [props.user.id],
    )

    return <article>{details.name}</article>
  },
).pipe(
  Async.async,
  Memoized.memoized,
  Memoized.withOptions({
    propsEquivalence: Equal.asEquivalence(),
  }),
)
```

Supplying `propsEquivalence` replaces the async component's default comparison,
so `fallback` is also included in this structural comparison.
