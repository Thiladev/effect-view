---
sidebar_position: 1
title: Getting Started
---

# Getting Started

`effect-view` lets a React function component be described as an Effect
program. Inside a component you can yield services, create scoped resources,
subscribe to Effect-powered state, and turn Effects into React callbacks. At a
React boundary, that description becomes a normal function component.

The core model has four pieces:

1. `ReactRuntime` builds the Effect services available to the UI.
2. `Component.make` defines an Effect View component.
3. `Component.withContext` converts an Effect View component into a normal
   React component at an application or router boundary.
4. Effect View children are composed through their `.use` Effect.

## Install

For a web application, install Effect View with Effect 4 and React 19.2 or
newer:

```bash npm2yarn
npm install effect-view effect@beta react react-dom
```

```bash npm2yarn
npm install --save-dev @types/react @types/react-dom
```

Effect View is not tied to React DOM. For React Native or another renderer,
install that renderer instead of `react-dom` and keep the rest of the setup the
same.

## Set up hot reloading with Vite

Install the Effect View Vite plugin to preserve component state while editing
Effect View components:

```bash npm2yarn
npm install --save-dev @effect-view/vite-plugin
```

Add `effectView()` before the React plugin in your Vite configuration:

```ts title="vite.config.ts"
import { effectView } from "@effect-view/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    effectView(),
    react(),
  ],
})
```

Vite is the only bundler supported for Effect View hot reloading at the moment.
Support for other bundlers will follow.

## Create the runtime

`ReactRuntime` owns a managed Effect runtime. Define it at module scope from the
layers needed by the UI:

```tsx title="src/runtime.ts"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { ReactRuntime } from "effect-view"

const AppLive = Layer.empty.pipe(
  Layer.provideMerge(FetchHttpClient.layer),
)

export const runtime = ReactRuntime.make(AppLive)
```

Keep the runtime stable. Creating it during a React render would create new
managed resources and a new React context on every render.

## Provide the runtime

Place `ReactRuntime.Provider` above every Effect View entrypoint. The provider
builds the runtime layer, makes its Effect context available through React, and
disposes the managed runtime when the provider unmounts.

Runtime construction can suspend, so give the provider a fallback:

```tsx title="src/main.tsx"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ReactRuntime } from "effect-view"
import { App } from "./App"
import { runtime } from "./runtime"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReactRuntime.Provider
      runtime={runtime}
      fallback={<p>Starting application...</p>}
    >
      <App />
    </ReactRuntime.Provider>
  </StrictMode>,
)
```

With a router, keep the provider above the router provider:

```tsx
<ReactRuntime.Provider runtime={runtime} fallback={<p>Starting...</p>}>
  <RouterProvider router={router} />
</ReactRuntime.Provider>
```

If runtime layer construction can fail, place an appropriate React error
boundary above `ReactRuntime.Provider` as well.

## Write your first component

`Component.make` defines a component body using the same generator style as
`Effect.gen` and `Effect.fn`. Providing a name creates a tracing span and also
sets the React DevTools display name:

```tsx title="src/HelloView.tsx"
import { Effect } from "effect"
import { Component } from "effect-view"

export const HelloView = Component.make("HelloView")(
  function* (props: { readonly name: string }) {
    const message = yield* Effect.succeed(`Hello, ${props.name}`)

    return <h1>{message}</h1>
  },
)
```

Use `Component.makeUntraced("HelloView")` when you want the display name but do
not want an automatic tracing span.

`HelloView` is an Effect View component description, not yet a normal React
component. Convert it at the point where plain React, a router, or a third-party
library needs a function component:

```tsx title="src/Hello.tsx"
import { Component } from "effect-view"
import { HelloView } from "./HelloView"
import { runtime } from "./runtime"

export const Hello = HelloView.pipe(
  Component.withContext(runtime.context),
)
```

It can now be rendered by ordinary React:

```tsx title="src/App.tsx"
import { Hello } from "./Hello"

export function App() {
  return <Hello name="Effect" />
}
```

`Component.withContext` reads the context populated by the matching
`ReactRuntime.Provider`. It does not build or provide the runtime by itself.

## Compose Effect View components

Inside another Effect View component, yield a child's `.use` Effect. This binds
the child to the current Effect context and returns a component that can be used
in JSX:

```tsx title="src/GreetingCardView.tsx"
import { Component } from "effect-view"
import { HelloView } from "./HelloView"

export const GreetingCardView = Component.make("GreetingCard")(
  function* () {
    const Hello = yield* HelloView.use

    return (
      <section>
        <Hello name="Effect" />
        <p>Both components use the same Effect context.</p>
      </section>
    )
  },
)
```

Only apply `Component.withContext` when crossing from Effect View into plain
React. Applying it to every nested component is unnecessary and makes it harder
to provide local services to a subtree.

## Synchronous and asynchronous components

A regular Effect View component runs its body during React render. Effects
executed directly by that body—including setup passed to `useOnMount`,
`useOnChange`, or `useLayer`—must complete synchronously every time they run.
Yielding services and reading synchronous state is fine; sleeping, fetching, or
awaiting a promise is not.

Choose the integration that matches the asynchronous work:

- Make the component asynchronous with [`Async.async`](./async) when it must
  wait for a one-off asynchronous Effect before producing JSX. The component
  suspends while it waits.
- Use [Query](./query) for server reads that need caching, sharing, refresh, or
  invalidation.
- Use [Mutation](./mutation) for user-triggered writes with observable pending
  and error state.
- Use `useRunPromise` or `useCallbackPromise` for asynchronous event work that
  does not need Mutation state.
- Use a post-commit hook with a scoped fiber for subscriptions or background
  work tied to the component lifecycle.

## Use Effect services

Components can yield Effect service tags directly. Their required service type
becomes part of the component type, so the final runtime or a local layer must
provide it:

```tsx title="src/GreetingService.ts"
import { Context, Layer } from "effect"

export class GreetingService extends Context.Service<
  GreetingService,
  { readonly greet: (name: string) => string }
>()("GreetingService") {
  static readonly layer = Layer.succeed(GreetingService, {
    greet: (name) => `Hello, ${name}`,
  })
}
```

```tsx title="src/GreetingView.tsx"
import { Component } from "effect-view"
import { GreetingService } from "./GreetingService"

export const GreetingView = Component.make("Greeting")(
  function* (props: { readonly name: string }) {
    const greeting = yield* GreetingService

    return <p>{greeting.greet(props.name)}</p>
  },
)
```

Add `GreetingService.layer` to the application runtime, or provide it only to a
subtree as shown later on this page.

Effect service instances are reactive at component boundaries. If the supplied
context changes to contain a different service instance, dependent Effect View
components are recreated so they read the new environment and restart their
scoped lifecycle.

## Understand lifecycle hooks

Effect View hooks are still React hooks internally. Call them unconditionally
at the top level of the component body, in a consistent order, and never inside
branches, loops, event handlers, or nested callbacks.

### The component root scope

Every rendered Effect View component gets a root `Scope.Scope`. Effect View
creates it when the component instance is rendered, provides it to the entire
component body, and closes it when that React component unmounts.

Effects yielded directly from the body therefore see the root scope. This also
means that `Effect.addFinalizer`, `Effect.acquireRelease`, and
`Effect.forkScoped` can be used naturally inside component setup:

```tsx
import { Effect } from "effect"
import { Component } from "effect-view"

const ResourceView = Component.make("Resource")(function* () {
  const resource = yield* Component.useOnMount(() =>
    Effect.acquireRelease(
      openResource,
      (resource) => closeResource(resource),
    ),
  )

  return <p>{resource.name}</p>
})
```

`useOnMount` does **not** create or provide another scope. It runs its Effect
with the context already available in the component body, so the resource above
is owned by the component's root scope.

`useOnChange`, `useReactEffect`, and `useReactLayoutEffect` each manage their
own resources. When their dependencies change, those resources are cleaned up
and recreated while the rest of the component remains active.

The main lifecycle choices are:

| Hook | What it does | Scope seen by setup | Scope closes when |
| --- | --- | --- | --- |
| Component body | Produces the component's rendered value | Component root scope | The component unmounts |
| `useOnMount` | Computes and caches a value for the component instance | Component root scope | The component unmounts |
| `useOnChange` | Recomputes a cached value when dependencies change | A new dependency scope | Dependencies change or the component unmounts |
| `useReactEffect` | Runs a post-commit side effect | A new effect scope | Dependencies change or the component unmounts |
| `useReactLayoutEffect` | Runs a layout effect before the browser paints | A new layout-effect scope | Dependencies change or the component unmounts |
| `useLayer` | Builds and provides a layer context | A new scope tied to the current layer reference | The layer reference changes or the component unmounts |

`useRunSync` and `useRunPromise` do not create a new scope. The runner they
return includes the component root scope in its context by default.
`useCallbackSync` and `useCallbackPromise` similarly capture the component
context required by their Effect.

### useOnMount

`Component.useOnMount` computes a value during the initial render and caches it
for later renders. It uses the component root scope, so its resources live
until the component unmounts.

```tsx title="src/LocalStateView.tsx"
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

export const LocalStateView = Component.make("LocalState")(
  function* () {
    const count = yield* Component.useOnMount(() =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.log("LocalState disposed"),
        )

        return Lens.fromSubscriptionRef(
          yield* SubscriptionRef.make(0),
        )
      }),
    )

    const [value] = yield* View.useAll([count])
    return <p>Count: {value}</p>
  },
)
```

In a regular component, the setup Effect must be synchronous because it runs
during render. In a component enhanced with `Async.async`, it may be
asynchronous and will suspend the component.

### useOnChange

`Component.useOnChange` computes and caches a value, then recomputes it when its
dependencies change. Each dependency set gets its own scope, which closes when
the dependencies change or the component unmounts.

```tsx
const label = yield* Component.useOnChange(
  () =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.log(`Stopped viewing ${props.userId}`),
      )

      return `Viewing user ${props.userId}`
    }),
  [props.userId],
)
```

Dependency arrays follow normal React semantics. Include every reactive value
read by the setup Effect.

### useReactEffect and useReactLayoutEffect

`Component.useReactEffect` runs side effects after React commits, while
`Component.useReactLayoutEffect` runs before the browser paints. Each hook owns
a scope that closes when its dependencies change or the component unmounts.

Setup must complete synchronously, but it can fork asynchronous work into the
hook scope:

```tsx
yield* Component.useReactEffect(
  () => Effect.forkScoped(listenForNotifications(props.userId)),
  [props.userId],
)
```

React Strict Mode may intentionally repeat development-only render and effect
setup. Initializers and resource acquisition should therefore be safe to run
more than once; production retains the normal component lifetime semantics.

## Run Effects from event handlers

React event handlers are plain functions. Use Effect View runners to execute an
Effect with the component's current context and scope:

```tsx
const runPromise = yield* Component.useRunPromise()

return (
  <button onClick={() => void runPromise(saveUser(user))}>
    Save
  </button>
)
```

Use `Component.useRunSync` only for Effects known to complete synchronously.
Use `Component.useRunPromise` for Effects that may suspend, sleep, fetch, or
otherwise continue asynchronously.

Both runners provide `Scope.Scope` by default, so they can run scoped Effects
without a type argument. When an Effect also requires application services,
declare the complete runner context explicitly:

```tsx
import { Scope } from "effect"

const runPromise = yield* Component.useRunPromise<
  Scope.Scope | UserRepository
>()
```

The resulting runner accepts Effects that require the component scope,
`UserRepository`, or both.

When a callback is passed to a memoized child or used as a dependency, use the
callback variants to preserve its identity:

```tsx
const save = yield* Component.useCallbackPromise(
  (nextUser: User) => saveUser(nextUser),
  [saveUser],
)

return <SaveButton onSave={() => void save(user)} />
```

`useCallbackSync` and `useCallbackPromise` follow the same dependency rules as
`React.useCallback`, while also supplying the Effect context when invoked.

## Use React normally

Effect View components can use regular React hooks, refs, context, event
handlers, and JSX composition:

```tsx
import { Component } from "effect-view"
import * as React from "react"

const CounterView = Component.make("Counter")(function* () {
  const [count, setCount] = React.useState(0)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  return (
    <button
      ref={buttonRef}
      onClick={() => setCount((count) => count + 1)}
    >
      Count: {count}
    </button>
  )
})
```

Prefer regular React state for simple, component-local UI concerns. Use
`Lens`/`View` when state needs Effect integration, subscriptions, focusing, or
sharing. The [State Management guide](./state-management) covers that model.

## Provide services to a subtree

Use `Component.useLayer` when only one Effect View subtree needs extra
services. It builds the layer in a scope and returns the resulting Effect
context:

```tsx title="src/GreetingPageView.tsx"
import { Effect } from "effect"
import { Component } from "effect-view"
import { GreetingView } from "./GreetingView"
import { GreetingService } from "./GreetingService"

export const GreetingPageView = Component.make("GreetingPage")(
  function* () {
    const context = yield* Component.useLayer(GreetingService.layer)
    const Greeting = yield* GreetingView.use.pipe(
      Effect.provide(context),
    )

    return <Greeting name="Effect" />
  },
)
```

Keep the layer reference stable. Define static layers outside the component or
memoize a layer that depends on props with `React.useMemo`; a new layer object
causes reconstruction and scoped cleanup.

Layer construction runs during render through `useOnChange`. A layer with
asynchronous acquisition requires the component to be enhanced with
`Async.async`. Resources built by the layer are released when the owning
component unmounts or the layer reference changes.

## Common pitfalls

- Effect View hooks obey React's Rules of Hooks even though they are called
  with `yield*`.
- Do not yield an asynchronous Effect from a regular component body. Use
  `Async.async`, Query, a Mutation callback, or a post-commit scoped fiber.
- `Component.withContext` needs a matching `ReactRuntime.Provider` above it.
- Apply `withContext` at React boundaries, not between Effect View components.
- Keep runtimes and layers stable instead of creating them on every render.
- Use `useRunPromise` rather than `useRunSync` for asynchronous event work.
- Suspense fallbacks handle waiting; React error boundaries handle failed
  component Effects.

## Where to go next

- [State Management](./state-management) explains `Lens`, `View`, local state,
  and focused state.
- [Query](./query) adds reactive keys, caching, refresh, and invalidation to
  Effect-based server reads.
- [Mutation](./mutation) models user-triggered Effect operations and their
  `AsyncResult` state.
- [Forms](./forms) builds schema-driven editable state with `MutationForm` and
  `LensForm`.

The repeatable pattern is small: provide one runtime, define components as
Effect programs, cross into plain React with `Component.withContext`, and use
`.use` everywhere inside the Effect View tree.
