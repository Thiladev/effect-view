# Async and Memoized

Two `Component` traits that control render behavior: `Async` lets a component's body suspend on an asynchronous Effect; `Memoized` skips re-rendering a component when its props haven't changed. They're commonly combined, since an unmemoized `Async` component restarts its async computation on every unrelated parent render.

## Async

Components run synchronously by default (the body must complete without suspending during render). `Async.async` lifts a component so its body may await an asynchronous Effect before returning JSX; React Suspense handles the wait.

```tsx
import { Effect } from "effect"
import { Async, Component } from "effect-view"

export const UserCard = Component.make("UserCard")(function* ({ userId }: { readonly userId: string }) {
  const user = yield* Component.useOnChange(() => loadUser(userId), [userId])
  return <article>{user.name}</article>
}).pipe(Async.async)
```

Render with a fallback (per-use or as a component default):

```tsx
const User = yield* UserCard.use
<User userId="123" fallback={<p>Loading user...</p>} />
```

```tsx
.pipe(Async.async, Async.withOptions({ defaultFallback: <p>Loading user...</p> }))
```

Rules:

- **Hook ordering**: place every React hook and effect-view hook helper *before* the first operation that may suspend. After a suspend point, the generator continuation runs outside React's synchronous render phase, so no hooks may follow it.
- The `promise` prop name is reserved on async components (used internally) — do not declare a prop with that name.

When to reach for `Async` vs alternatives:

- One-off asynchronous read before rendering → `Async.async`.
- Cached/shared/refreshable server reads → `Query` (see `Query.md`).
- User-triggered writes with pending/error state → `Mutation` (see `Mutation.md`).
- Async work in an event handler with no need for `Mutation` state → `useRunPromise`/`useCallbackPromise` (see `Component.md`).
- Subscriptions or background work tied to lifecycle → a scoped fiber forked from `useReactEffect`.

## Memoized

Wraps a component's rendered function with `React.memo`, so an unrelated parent re-render doesn't re-run the component (or restart an `Async` child's in-flight computation) when props are unchanged.

```tsx
import { Async, Component, Memoized } from "effect-view"

export const UserCard = Component.make("UserCard")(function* ({ userId }: { readonly userId: string }) {
  const user = yield* Component.useOnChange(() => loadUser(userId), [userId])
  return <article>{user.name}</article>
}).pipe(Async.async, Memoized.memoized)
```

- Default comparison is `Object.is` per prop (React.memo default), except on `Async` components where `fallback` is excluded from the comparison by default.
- Override with `Memoized.withOptions({ propsEquivalence })`, e.g. `Equal.asEquivalence()` for full structural equality on immutable data. Supplying `propsEquivalence` replaces the default entirely (so `fallback` is included again for `Async` components unless you exclude it yourself).
- `Memoized` is not exclusive to `Async` — it applies to any `Component` — but it matters most there, since an unmemoized async child otherwise closes/reopens its dependency scope and re-runs its async setup on every parent render.
