---
sidebar_position: 1
title: Getting Started
---

# Getting Started

`effect-fc` lets React components be written as Effect programs. Inside a
component body you can yield services, run Effects, subscribe to Effect-powered
state, and still export a normal React function component at the edge of your
app.

## Install

Install `effect-fc` alongside `effect` and React 19.2 or newer:

```bash npm2yarn
npm install effect-fc effect react
```
```bash npm2yarn
npm install --save-dev @types/react
```

`effect-fc` is not opinionated about the React platform. Use it with web,
native, custom renderers, or any environment where React components can run.
Then install the platform-specific React packages for your target.

For web apps, install React DOM:

```bash npm2yarn
npm install react-dom
```
```bash npm2yarn
npm install --save-dev @types/react-dom
```

## Create A Runtime

An Effect-FC app needs an Effect runtime. Build one from the services your UI
needs, then share it with React through `ReactRuntime.Provider`.

For an empty app, `Layer.empty` is enough:

```tsx title="src/runtime.ts"
import { Layer } from "effect"
import { ReactRuntime } from "effect-fc"

export const runtime = ReactRuntime.make(Layer.empty)
```

As your app grows, add services to the layer:

```tsx title="src/runtime.ts"
import { FetchHttpClient } from "@effect/platform"
import { Layer } from "effect"
import { ReactRuntime } from "effect-fc"

const AppLive = Layer.empty.pipe(
  Layer.provideMerge(FetchHttpClient.layer),
)

export const runtime = ReactRuntime.make(AppLive)
```

## Provide The Runtime

At the React root, wrap your app with `ReactRuntime.Provider`:

```tsx title="src/main.tsx"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ReactRuntime } from "effect-fc"
import { App } from "./App"
import { runtime } from "./runtime"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReactRuntime.Provider runtime={runtime}>
      <App />
    </ReactRuntime.Provider>
  </StrictMode>,
)
```

`ReactRuntime.Provider` also works with routers. Keep it above your router
provider so route components can be converted with the same runtime context.

## Write Your First Component

Use `Component.make` when you want automatic tracing spans, or
`Component.makeUntraced` when you only want the component behavior. This creates
an Effect-FC component, not a plain React component yet.

The Effect run during render must be synchronous. Effect-FC follows React's
render model, so component bodies should produce JSX without waiting on async
work. Use lifecycle hooks, callbacks, queries, or other Effect-FC helpers for
async work that happens outside render.

```tsx title="src/HelloView.tsx"
import { Effect } from "effect"
import { Component } from "effect-fc"

export const HelloView = Component.make("HelloView")(function* (props: {
  readonly name: string
}) {
  const message = yield* Effect.succeed(`Hello, ${props.name}`)

  return <h1>{message}</h1>
})
```

At this point `HelloView` can yield Effects, services, and scoped lifecycle
work, but React cannot render it directly.

## Apply A Runtime

Use `Component.withRuntime` at the boundary where an Effect-FC component needs
to become a regular React function component.

```tsx title="src/Hello.tsx"
import { Component } from "effect-fc"
import { HelloView } from "./HelloView"
import { runtime } from "./runtime"

export const Hello = HelloView.pipe(
  Component.withRuntime(runtime.context),
)
```

`Hello` is now a normal React component:

```tsx title="src/App.tsx"
import { Hello } from "./Hello"

export function App() {
  return <Hello name="Effect" />
}
```

## Use Effect-FC Components Together

Inside an Effect-FC component, other Effect-FC components are available through
their `.use` effect. Yield `.use` to get a React component for the current
runtime context, then render it like JSX.

```tsx title="src/GreetingCardView.tsx"
import { Component } from "effect-fc"
import { HelloView } from "./HelloView"

export const GreetingCardView = Component.make("GreetingCard")(
  function* () {
    const Hello = yield* HelloView.use

    return (
      <section>
        <Hello name="Effect" />
        <p>This component is still running inside Effect-FC.</p>
      </section>
    )
  },
)
```

Use `Component.withRuntime` only when you leave the Effect-FC tree and need a
normal React component again:

```tsx title="src/GreetingCard.tsx"
import { Component } from "effect-fc"
import { GreetingCardView } from "./GreetingCardView"
import { runtime } from "./runtime"

export const GreetingCard = GreetingCardView.pipe(
  Component.withRuntime(runtime.context),
)
```

## Component Lifecycle

Every Effect-FC component instance exposes an Effect `Scope`. Effects that need
`Scope.Scope` can use that component scope to register finalizers, fork scoped
work, or acquire scoped resources.

The component scope is created when React mounts the component and closes when
React unmounts it. When the scope closes, Effect runs the finalizers registered
inside that scope.

Finalizers are forked when the scope closes, so cleanup logic can run
asynchronous Effects even though the component body itself must stay
synchronous.

```tsx title="src/MountedMessageView.tsx"
import { Console, Effect } from "effect"
import { Component } from "effect-fc"

export const MountedMessageView = Component.make("MountedMessage")(
  function* () {
    const message = yield* Component.useOnMount(() =>
      Effect.gen(function* () {
        yield* Console.log("MountedMessage mounted")
        yield* Effect.addFinalizer(() =>
          Console.log("MountedMessage unmounted"),
        )

        return "This value was loaded on mount."
      }),
    )

    return <p>{message}</p>
  },
)
```

Use `Component.useOnMount` when the component needs a value produced by an
Effect during its first render. The value is then cached for the component
instance. You can also use it to set up scoped component logic, subscriptions,
or resources that should live for the lifetime of that component instance.

Use `Component.useOnChange` when render needs the value computed by
scoped work that depends on changing inputs. When a dependency changes, React
re-renders the component and the hook computes the next value during that
render.

```tsx
import { Console, Effect } from "effect"
import { Component } from "effect-fc"

const UserPanelView = Component.make("UserPanel")(
  function* (props: { readonly userId: string }) {
    const label = yield* Component.useOnChange(
      () =>
        Effect.gen(function* () {
          yield* Console.log(`Preparing view for ${props.userId}`)
          yield* Effect.addFinalizer(() =>
            Console.log(`Cleaning up ${props.userId}`),
          )

          return `Viewing user ${props.userId}`
        }),
      [props.userId],
    )

    return <p>{label}</p>
  },
)
```

In this example, each `userId` gets its own scope. When `userId` changes,
Effect-FC closes the previous scope, runs its finalizers, and creates a new
scope for the next load. Unlike `useOnMount`, `useOnChange` does not expose the
component's root scope directly. It creates and provides its own scope for that
dependency window. Some other Effect-FC hooks follow the same pattern when they
need a lifecycle that is narrower than the whole component instance.

## Useful Effect-FC Hooks

Unlike plain React hooks, Effect-FC hooks return Effects. Use `yield*` to run
them inside the component body.

The most common Effect-FC hooks are:

- `Component.useOnMount`: run an Effect once during the component's first render
  after mount, and return its value. The Effect must be synchronous.

```tsx
const initialData = yield* Component.useOnMount(() => loadInitialData)
```

- `Component.useOnChange`: when a dependency changes, React re-renders the
  component and the Effect is run again inside the component body. It returns
  the latest value, so the Effect must be synchronous too.

```tsx
const label = yield* Component.useOnChange(() => formatUserLabel(id), [id])
```

- `Component.useReactEffect`: Effect-powered `React.useEffect` for side effects
  that do not need to compute render output or trigger a re-render. The Effect
  must be synchronous and can register scoped finalizers.

```tsx
yield* Component.useReactEffect(
  () => Effect.forkScoped(subscribeToUser(id)),
  [id],
)
```

- `Component.useReactLayoutEffect`: Effect-powered `React.useLayoutEffect` with scoped
  finalizers.

```tsx
yield* Component.useReactLayoutEffect(() => measure(ref), [])
```

- `Component.useRunSync` and `Component.useRunPromise`: run Effects from React
  event handlers.

```tsx
const runPromise = yield* Component.useRunPromise()

return (
  <button onClick={() => void runPromise(saveUser)}>
    Save
  </button>
)
```

- `Component.useCallbackSync` and `Component.useCallbackPromise`: create stable
  React callbacks.

```tsx
const save = yield* Component.useCallbackPromise(
  (user: User) => saveUser(user),
  [],
)

return <button onClick={() => void save(user)}>Save</button>
```

## Use React Normally

An Effect-FC component is still a React function component. Anything you can do
in a regular React component can also be done in an Effect-FC component,
including React hooks, refs, event handlers, context, and JSX composition.

```tsx
import { Component } from "effect-fc"
import * as React from "react"

const CounterView = Component.make("Counter")(function* () {
  const [count, setCount] = React.useState(0)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  return (
    <button ref={buttonRef} onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
})
```

Use regular React hooks for local UI concerns, and reach for Effect-FC helpers
when the component needs Effect services, scopes, resources, or Effect-powered
callbacks.

## Use Tags

Components can yield Effect tags directly in the component body. There is no
need to memoize the service yourself; just yield the tag wherever the component
needs it.

```tsx title="src/Greeting.tsx"
const GreetingView = Component.make("Greeting")(function* (props: {
  readonly name: string
}) {
  const greeting = yield* GreetingService

  return <p>{greeting.greet(props.name)}</p>
})
```

Service values in the runtime context are reactive by default. If a provided
service instance changes, Effect-FC unmounts and mounts again the components
that depend on that context, so they read the new service and restart their
scoped lifecycle with the new environment. For services that should not trigger
that behavior, pass their tags with `Component.withOptions({ nonReactiveTags:
[...] })`.

## Provide Services To A Subtree

Use `Component.useContextFromLayer` when an Effect-FC component should provide
extra services to another Effect-FC component. It turns a `Layer` into a runtime
context that can be provided to `.use`.

```tsx title="src/GreetingPageView.tsx"
import { Effect } from "effect"
import { Component } from "effect-fc"
import { GreetingView } from "./Greeting"
import { GreetingService } from "./services"

const GreetingLive = GreetingService.Default({
  greet: (name: string) => `Welcome, ${name}`,
})

export const GreetingPageView = Component.make("GreetingPage")(function* () {
  const context = yield* Component.useContextFromLayer(GreetingLive)
  const Greeting = yield* Effect.provide(GreetingView.use, context)

  return <Greeting name="Effect" />
})
```

The layer passed to `useContextFromLayer` should be stable. If a new layer value
is created on every render, Effect-FC has to build a new context, which can
cause unnecessary re-renders and scoped lifecycle restarts. Define static layers
outside the component, or memoize layers that depend on React props or state.

Layers built with `useContextFromLayer` are scoped to the component that builds
them. That means service construction can register scoped logic, acquire
resources, fork scoped fibers, and add finalizers that are tied to that
component's lifecycle.

## Where To Go Next

Once the runtime and component boundary are in place, the rest of the library
builds on the same idea:

- `Subscribable.useAll` reads Effect subscribables and rerenders when they
  change.
- `Lens` connects React state and Effect `SubscriptionRef` values.
- `Query` and `Mutation` model async data and user-triggered operations.
- `Form`, `SubmittableForm`, and `SynchronizedForm` help build Effect-backed
  forms.

The important pattern is small and repeatable: write Effect-FC components inside
the runtime, then use `Component.withRuntime` at React boundaries.
