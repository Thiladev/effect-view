# Effect–React Render Lifecycle Report

## Purpose

This report describes the lifecycle problem in `effect-view`, why abandoned React renders leak Effect scopes, what the experimental implementations attempted, why those implementations are not satisfactory, and how a robust system should be designed.

The experimental implementation discussed here has been removed from the source tree. This document is intended as design material for a clean reimplementation.

## Executive summary

The fundamental problem is not scope disposal by itself. It is that `effect-view` performs Effect work and creates resource scopes while React is rendering.

React distinguishes between two broad phases:

1. **Render:** React evaluates components and builds a prospective tree. React may retry, pause, duplicate, or permanently abandon this work.
2. **Commit:** React accepts a rendered tree and runs layout and passive effects. Cleanup callbacks only exist for work that reached this phase.

The existing `Component.useScope` creates and registers an Effect scope during render, but installs its cleanup from `React.useEffect`. If React abandons the render, the effect is never mounted, its cleanup is never installed, and the render-created scope remains registered indefinitely.

There is no public React callback for “this render attempt was abandoned.” Consequently, an object created only for a render attempt cannot receive deterministic abandonment notification.

A correct architecture must therefore choose one of these models:

- Do not acquire resources until commit.
- Store render-time resources in an external registry under an explicit, stable identity.
- Treat render-time resources as speculative cached entries and garbage-collect idle entries, while ensuring an expired entry can always be recreated safely.

The first model is simplest. The second is the model used by atom/resource systems. The third is necessarily a cache/TTL design rather than exact component-lifecycle tracking.

## The original `useScope` lifecycle

The implementation in `Component.ts` performs approximately the following work:

```ts
function useScope(dependencies) {
    const { key, scope } = React.useMemo(() => {
        const key = makeIdentity()
        const scope = makeEffectScope()
        scopeMap.set(key, { scope, closeFiber: none() })

        return { key, scope }
    }, dependencies)

    React.useEffect(() => {
        cancelPreviouslyScheduledClose(key)

        return () => {
            const closeFiber = sleep(debounce).andThen(close(scope)).fork()
            scopeMap.set(key, { scope, closeFiber: some(closeFiber) })
        }
    }, [key])

    return scope
}
```

The intended committed lifecycle is:

```text
render
  create scope
  insert scope into ScopeMap

commit
  run useEffect setup
  cancel any pending close left by a rapid remount

unmount or dependency change
  run useEffect cleanup
  wait for the debounce
  close the scope
  remove it from ScopeMap
```

For an ordinary committed component, this works. The debounce also bridges React Strict Mode’s development-only effect cycle:

```text
effect setup
effect cleanup       schedules close
effect setup again   cancels close
```

The failing lifecycle is:

```text
render
  create scope
  insert scope into ScopeMap

React abandons render
  useEffect setup never runs
  useEffect cleanup therefore never exists
  no close is scheduled
  ScopeMap retains the scope forever
```

Suspense can trigger this by throwing a promise before the component commits. Concurrent rendering and failed/erroring renders can produce the same category of problem.

## Why React cannot directly report abandonment

Hooks such as `useEffect` and `useLayoutEffect` describe the lifetime of a committed component. They are deliberately not executed for render work that never commits.

Render-time hook state does not solve this:

- `useMemo` may be discarded with the render attempt.
- `useRef` belongs to the same provisional fiber state.
- `useState` belongs to the same provisional fiber state.
- Cleanup returned from `useEffect` only exists after effect setup has run.
- A component cannot read its React `key`; React consumes it before props reach the component.

JavaScript garbage collection is also insufficient. `FinalizationRegistry` is nondeterministic and cannot be used to guarantee timely execution of Effect finalizers.

This means there is no reliable per-render-attempt destructor available to application code.

## Why Effect Atom can use an external lifecycle

Effect Atom has something a component scope does not: an atom is an explicit object with stable identity outside React.

The conceptual flow is:

```text
React receives an Atom object
        │
        ▼
AtomRegistry.getOrCreate(atom)
        │
        ├── returns an existing external node
        └── or creates a new external node and schedules idle removal

React commit subscribes to the node
        │
        └── subscription prevents idle removal

React unmount unsubscribes
        │
        └── node becomes eligible for removal
```

If a render is abandoned, no subscription is established. The node is still owned by the external registry and can remove itself when idle. If React retries later, it asks the registry for the atom again. The registry either returns the still-live node or creates a replacement.

`useSyncExternalStore` belongs naturally in this design because an atom node has a changing snapshot. React must both subscribe to changes and read a consistent value.

A component scope does not naturally have either property:

- It has no explicit identity external to React.
- Its scope object is not a changing UI snapshot.

Therefore, copying the Atom mechanism without first solving identity produces abstractions that look like an external store but are actually render-attempt bookkeeping.

## The experimental external-store implementation

The first experiment introduced three concepts:

- A runtime-owned registry.
- A render-owned store/handle created with `useMemo`.
- A registry entry containing the Effect scope and its cleanup state.

It used `useSyncExternalStore` as follows:

```text
getSnapshot during render
  create a scope entry
  register it externally
  immediately schedule idle cleanup

subscribe during commit
  retain the entry
  cancel idle cleanup

unsubscribe during unmount
  release the entry
  schedule cleanup
```

This fixed the abandoned-render leak because an uncommitted entry had no subscriber and its initial cleanup remained scheduled.

It also allowed a closed snapshot to be replaced: if cleanup won a race before subscription, a later `getSnapshot` could create another entry.

However, it had several design problems:

1. The “store” was created by `useMemo`, so it was not truly an externally identified store.
2. `useSyncExternalStore` was being used primarily as a commit/unmount detector rather than for observable state.
3. The names “store,” “entry,” and “snapshot” obscured the resource lifecycle.
4. It introduced listener notification machinery even though a scope has no meaningful changing value for the UI.
5. It gave the appearance of Atom’s semantics without possessing Atom’s stable external identity.

It was functional as a self-healing speculative cache, but it was not a clean model for a component instance.

## The experimental retain/release implementation

The second experiment removed `useSyncExternalStore` and represented the lifecycle directly:

```ts
const registration = React.useMemo(
    () => scopeMap.register(context, options),
    dependencies,
)

React.useLayoutEffect(() => {
    registration.retain()
    return registration.release
}, [registration])

return registration.scope
```

Registration immediately scheduled its own close. A committed layout effect cancelled that close through `retain()`. Unmount called `release()` and scheduled it again.

This was much easier to understand:

```text
registration created  → provisional
layout effect setup    → retained
layout effect cleanup  → released
idle timeout           → closed
```

It still had a serious race:

```text
render creates provisional registration
React delays commit longer than the cleanup debounce
registration closes
React eventually commits the same render
layout effect calls retain on an already-closed registration
component now holds a closed Effect scope
```

The external-store version could recover by returning a new snapshot. The direct retain/release version could not trigger a render-time replacement after the scope had closed.

Increasing the timeout reduces the likelihood but does not make the system correct. A timeout cannot prove that React has abandoned work.

## What the bookkeeping in the experiment was doing

The experimental implementation contained more machinery than the conceptual model suggested. Each part existed for a specific race:

### Runtime registry

The registry retained every scope that might still need disposal. It also allowed `ReactRuntime` disposal to close every remaining scope.

A `HashMap` and `Ref` were used, but neither is essential for a synchronous JavaScript registry. A `Set<Registration>` would express the ownership more clearly unless atomic Effect composition is specifically required.

### Unique registration key

Each speculative render needed a separate map entry. Otherwise two simultaneous attempts could overwrite or close one another.

### Cleanup fiber

The fiber represented the debounce period followed by scope closure. Retaining the registration interrupted this fiber.

### Cleanup generation

Interrupting an Effect fiber is not equivalent to synchronously erasing every continuation it may execute. Consider:

```text
cleanup A is running
retain interrupts cleanup A
release schedules cleanup B
cleanup A's ensuring handler finishes afterward
```

If cleanup A blindly clears the `closeFiber` field, it erases the reference to cleanup B. A monotonically increasing generation lets a finalizer clear the field only if it still represents the current scheduled close.

### Retain count

A count allows repeated retain/release pairs, including Strict Mode effect simulation, without closing while at least one committed lease remains. A boolean is sufficient only if the code can prove that setup and cleanup are perfectly paired and never nested.

These details are legitimate in a speculative cache, but they should be encapsulated behind a much smaller domain model.

## The identity problem

An external registry needs a key that means “this logical resource.” Possible candidates all have limitations:

### Component definition

Using the `Component` object would make every mounted instance of the same component share one scope. That breaks per-instance mount state and cleanup.

### Props or dependency values

Two component instances can have equal props while requiring independent scopes. Object props may also be recreated on every render.

### `useId`

`useId` is intended for accessibility and hydration identifiers, not general cache identity. Concurrent versions of the same logical component can receive the same identifier, and uniqueness across multiple roots depends on root configuration. It should not silently become a resource-ownership contract.

### React `key`

This would be conceptually useful, but React does not expose it to the component. Requiring a separate explicit resource key would be an API change.

### A value made by `useMemo`, `useRef`, or `useState`

These values identify a React fiber lifetime only after React preserves that hook state. They do not survive an abandoned initial render and therefore cannot provide Atom-style external identity.

The clean external design consequently requires an explicit identity supplied by the application or created outside the speculative render.

## Recommended architecture

The API should distinguish committed lifecycle work from render-time resources instead of trying to give them identical semantics.

### 1. Commit-only component scopes

Use this model for resources that do not need to affect the current render synchronously.

```ts
function useCommittedScope(options): ScopeState {
    const [scope, setScope] = React.useState<Scope.Closeable | undefined>()

    React.useLayoutEffect(() => {
        const scope = makeScope(options)
        setScope(scope)

        return () => runClose(scope)
    }, dependencies)

    return scope
}
```

The exact API need not use state, but the invariant should be:

> No resource is acquired until React commits the component.

An abandoned render then has nothing to clean up.

This may require changing APIs that currently expect acquisition results during the same render. Such APIs cannot be made commit-only without representing an uninitialized/loading state or causing a subsequent render.

### 2. Explicit external resources for Suspense

Use this model when rendering depends on asynchronous acquisition or a promise.

```ts
interface ResourceKey {
    readonly id: string
}

interface ResourceNode<A> {
    readonly read: () => A
    readonly subscribe: (listener: () => void) => () => void
}

const node = resourceRegistry.getOrCreate(key, createResource)
const value = React.useSyncExternalStore(node.subscribe, node.read, node.read)
```

Here `useSyncExternalStore` is justified because the node is truly external, has a stable explicit key, and has a changing observable result.

The node lifecycle should be:

```text
absent
  │ getOrCreate
  ▼
idle/pending ── subscribe ──► retained
    ▲                           │
    └──── unsubscribe ──────────┘
    │
    └── idle TTL expires ──► disposed and removed
```

If a node expires before a retry, `getOrCreate` constructs a new node. No React render can remain permanently bound to an expired object without revalidating it.

### 3. Make `useOnMount` semantics explicit

The name `useOnMount` suggests commit-time execution, but if its Effect is evaluated from `useMemo` during render, it is actually speculative render-time execution.

The library should choose and document one of these contracts:

- `useOnMount` runs only after commit and cannot synchronously return an acquisition result during the initial render.
- A separate render-safe primitive accepts only pure/synchronous computation.
- A resource primitive uses an explicit external resource key and supports Suspense.

Allowing arbitrary scoped Effects to execute during render while promising exact component cleanup is the combination that creates the unsolvable abandonment problem.

## Required invariants for an external resource registry

If an Atom-style registry is implemented, it should satisfy all of the following:

1. **Stable identity:** Every node is addressed by an explicit resource key independent of React hook state.
2. **Idempotent lookup:** Repeated reads of the same key return the same live node.
3. **Recoverable expiry:** A lookup after disposal returns a new live node, never the disposed node.
4. **Commit retention:** A committed subscriber prevents idle disposal.
5. **Abandoned-render collection:** A node read by an abandoned render has no subscriber and becomes eligible for disposal.
6. **Reference-counted ownership:** One unmount cannot dispose a node still used by another subscriber.
7. **Idempotent disposal:** Closing a node multiple times has the same result as closing it once.
8. **Registry disposal:** Disposing the runtime closes every node regardless of subscriber state.
9. **Generation safety:** Completion of an older cleanup task cannot overwrite or cancel newer lifecycle state.
10. **Consistent snapshot:** React must never receive a closed node as the current live snapshot.

## Required test matrix

A replacement should be tested against lifecycle sequences, not only final rendered output.

### Normal lifecycle

- Initial commit acquires exactly the intended resources.
- Rerender with equivalent dependencies does not reacquire.
- Dependency change releases the old resource and acquires the new one.
- Unmount runs every finalizer once.

### Strict Mode

- Development render duplication does not leak the discarded attempt.
- Effect setup/cleanup/setup simulation does not prematurely close the committed resource.
- Final unmount closes all remaining resources.

### Suspense

- A render that suspends forever does not retain resources indefinitely.
- A suspended render that retries can obtain a live resource after any idle cleanup.
- Resolving an obsolete promise cannot mutate or resurrect a newer node.
- Changing props while pending disposes or detaches the obsolete computation.

### Concurrent replacement

- The current committed tree remains usable while a replacement tree renders.
- Abandoning the replacement does not affect the current tree.
- Committing the replacement releases the previous tree only after the replacement commits.

### Runtime disposal

- Disposing `ReactRuntime` closes committed resources.
- It also closes idle, pending, and speculative registry nodes.
- Pending async fibers are interrupted without unhandled promise rejections.

### Timing races

- Retain racing with scheduled disposal has a deterministic winner.
- Disposal racing with retry either preserves the live node or forces recreation.
- An old cleanup task cannot clear the handle for a newer cleanup task.

## Suggested minimal domain model

For a real external resource cache, the implementation can remain small if the names match the responsibilities:

```ts
interface ResourceRegistry {
    getOrCreate<A>(key: ResourceKey, create: () => ResourceNode<A>): ResourceNode<A>
    dispose: Effect.Effect<void>
}

interface ResourceNode<A> {
    readonly key: ResourceKey
    readonly read: () => A
    readonly subscribe: (listener: () => void) => () => void
    readonly dispose: Effect.Effect<void>
}
```

Internally, a node can own:

- Its Effect scope.
- Its current result or promise.
- Its subscribers.
- Its idle cleanup task.
- Its lifecycle generation.

There should not be a separate render-owned object called a “store.” React should interact directly with the externally owned node.

For commit-only scopes, the model is even smaller:

```ts
interface ComponentScope {
    readonly scope: Scope.Closeable
    readonly close: Effect.Effect<void>
}
```

Create it at commit and close it at effect cleanup. No registry, snapshot, subscription, speculative timer, or abandonment recovery is necessary unless runtime-wide disposal must independently own it.

## Final recommendation for `effect-view`

Do not attempt to hide both committed component lifecycles and render-time Suspense resources behind one implicit `Scope` mechanism.

The most defensible direction is:

1. Make normal component acquisition commit-driven.
2. Prevent or clearly label arbitrary Effect acquisition during render.
3. Introduce a separate external resource abstraction for async/Suspense work.
4. Require that abstraction to have an explicit stable key.
5. Use `useSyncExternalStore` only for those externally owned nodes whose snapshots can change.
6. Treat idle timeout as cache eviction, not as proof that React abandoned a render.
7. Make every read capable of replacing an expired node.

If backward compatibility requires speculative per-render scopes, document that the debounce is heuristic and retain the recovery behavior that can replace a scope which expires before commit. That model can prevent leaks, but it should not be presented as exact React component-instance lifecycle tracking.
