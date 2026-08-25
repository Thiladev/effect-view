# Component

Defines a React function component as an Effect program. A `Component` is a description, not yet a React component — cross into React with `Component.withContext` or `.use`.

## Define

```tsx
import { Effect } from "effect"
import { Component } from "effect-view"

export const HelloView = Component.make("HelloView")(function* (props: { readonly name: string }) {
  const message = yield* Effect.succeed(`Hello, ${props.name}`)
  return <h1>{message}</h1>
})
```

- `Component.make(spanName?)(generatorBody, ...pipeArgs)` — same overloads as `Effect.fn`/`Effect.gen`: a generator body, or a body plus `(_, props) => next` pipeline steps. Passing a `spanName` wraps the body in a tracing span and sets `displayName`.
- `Component.makeUntraced` is identical but skips the automatic span (still sets `displayName` from the name argument).
- The component's props type, return type, error channel, and required services (`R`) are all inferred from the generator body.

## Cross into React

```tsx
export const Hello = HelloView.pipe(Component.withContext(runtime.context))
// <Hello name="Effect" />
```

`Component.withContext(context)` reads the Effect context supplied by the matching `ReactRuntime.Provider` and turns the component into a plain `React.FC`. Apply it only at boundaries where plain React (a router, a third-party lib, an app root) needs a function component — never between two effect-view components.

## Compose inside effect-view

```tsx
const Hello = yield* HelloView.use
return <Hello name="Effect" />
```

`component.use` is an `Effect<F, never, Exclude<R, Scope.Scope>>` that binds the child to the current Effect context/scope and returns a stable function-component reference. Yield it from a parent component body; do not call `withContext` here.

## Lifecycle hooks

Hooks are plain React hooks under the hood: call them unconditionally, at the top level, in the same order every render — never in branches, loops, callbacks, or after a suspend point.

Every rendered component instance gets a root `Scope.Scope`, created on mount and closed on unmount, provided to the whole body. `Effect.addFinalizer`, `Effect.acquireRelease`, `Effect.forkScoped` used directly in the body run against this scope.

| Hook | Purpose | Scope | Closes |
|---|---|---|---|
| body | produce rendered output | component root scope | unmount |
| `useOnMount(() => effect)` | compute + cache once | component root scope | unmount |
| `useOnChange(() => effect, deps)` | recompute on deps change | new scope per dep set | deps change / unmount |
| `useReactEffect(() => effect, deps?)` | post-commit side effect (`Effect.useEffect` analog) | new scope | deps change / unmount |
| `useReactLayoutEffect(() => effect, deps?)` | pre-paint side effect | new scope | deps change / unmount |
| `useLayer(layer, options?)` | build + provide a `Layer`, returns its `Context` | new scope tied to layer identity | layer ref changes / unmount |

```tsx
const state = yield* Component.useOnMount(() =>
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.log("disposed"))
    return Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))
  }),
)
```

- Setup passed to `useOnMount`/`useOnChange`/`useLayer` must complete **synchronously** in a regular component (it runs during render). Wrap the component with `Async.async` to allow suspending setup.
- `useReactEffect`/`useReactLayoutEffect` setup must also start synchronously but may `Effect.forkScoped` async work into the hook's own scope.
- `useRunSync`/`useRunPromise`/`useCallbackSync`/`useCallbackPromise` do not create a new scope; they capture the component root scope (and any extra services you request) by default.

## Run Effects from event handlers

```tsx
const runPromise = yield* Component.useRunPromise() // or useRunPromise<Scope.Scope | SomeService>()
<button onClick={() => void runPromise(saveUser(user))}>Save</button>
```

- `useRunSync<R>()` — only for Effects guaranteed to complete synchronously.
- `useRunPromise<R>()` — for Effects that may suspend/sleep/fetch.
- `useCallbackSync(f, deps)` / `useCallbackPromise(f, deps)` — memoized variants (same deps semantics as `React.useCallback`) for passing stable callbacks to children.
- Both runners provide `Scope.Scope` automatically; add extra services with an explicit type argument (`useRunPromise<Scope.Scope | UserRepository>()`).

## Provide services

Static layer, one instance per mounted component, disposed on unmount:

```tsx
const GreetingViewLive = GreetingView.pipe(Component.provide(GreetingService.layer))
```

Layer built from render-time state (props/context), provided to children explicitly:

```tsx
const layer = React.useMemo(() => Layer.succeed(GreetingService, {...}), [props.greeting])
const context = yield* Component.useLayer(layer)
const Greeting = yield* Effect.provide(GreetingView.use, context)
return <Greeting name="Effect" />
```

Keep layer references stable (module scope or `React.useMemo`) — a new layer object triggers rebuild and finalizer cleanup. Async layer construction requires `Async.async` on the owning component.

## Common pitfalls

- Never yield an asynchronous Effect from a regular component body — use `Async.async`, `Query`, a `Mutation` callback, or a scoped fiber forked from a post-commit hook instead.
- `Component.withContext` needs a matching `ReactRuntime.Provider` above it in the tree.
- Prefer `useRunPromise` over `useRunSync` for event handlers that may be async.
- Regular React hooks, refs, context, and state work normally inside a component body alongside `yield*`.
