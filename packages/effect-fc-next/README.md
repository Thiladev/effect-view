<p align="center">
  <a href="https://thila.dev/effect-view">
    <img src="../docs/static/img/logo.svg" width="104" height="104" alt="Effect View logo" />
  </a>
</p>

<h1 align="center">Effect View</h1>

<p align="center">
  Write React components as typed Effect programs.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/effect-view"><img src="https://img.shields.io/npm/v/effect-view?color=08777b" alt="npm version" /></a>
  <a href="https://thila.dev/effect-view"><img src="https://img.shields.io/badge/docs-Effect_View-16a3a1" alt="Effect View documentation" /></a>
  <a href="https://github.com/Thiladev/effect-view/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/effect-view?color=e99526" alt="MIT license" /></a>
</p>

<p align="center">
  <strong><a href="https://thila.dev/effect-view">Read the documentation →</a></strong>
</p>

Effect View brings Effect's typed services, resource safety, concurrency, and
data modeling into React 19 without replacing React's component model. Yield
Effects and services from a component body, let scopes follow the React
lifecycle, and return ordinary JSX.

> **Effect v4 beta:** Effect View is built for the Effect v4 beta release. If
> your application uses Effect v3, use the legacy
> [`effect-fc` package](https://www.npmjs.com/package/effect-fc) instead.

```bash
npm install effect-view effect@beta react
```

Effect View does not depend on `react-dom`. Install the renderer used by your
application—for example, `react-dom` for the web:

```bash
npm install react-dom
```

You can use Effect View with React Native or any other React renderer instead.

## What it looks like

An Effect View component is an Effect program that produces JSX. It can create
scoped state, access services, and use React-facing hooks without leaving the
generator model:

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens } from "effect-view"
import { runtime } from "./runtime"

const CounterValueView = Component.make("CounterValue")(
  function* ({ count }: { readonly count: Lens.Lens<number> }) {
    yield* Component.useOnMount(() =>
      Effect.addFinalizer(() =>
        Effect.log("CounterValue unmounted"),
      ),
    )

    const [value, setValue] = yield* Lens.useState(count)

    return (
      <button onClick={() => setValue((n) => n + 1)}>
        Count: {value}
      </button>
    )
  },
)

const CounterView = Component.make("Counter")(function* () {
  const count = yield* Component.useOnMount(() =>
    Effect.map(
      SubscriptionRef.make(0),
      Lens.fromSubscriptionRef,
    ),
  )

  const CounterValue = yield* CounterValueView.use

  return <CounterValue count={count} />
})

export const Counter = CounterView.pipe(
  Component.withContext(runtime.context),
)
```

`CounterView` composes another Effect View component by yielding its `.use`
Effect, then renders the resulting component as ordinary JSX. The child can
access the current Effect context and receives its own component scope.

`Effect.addFinalizer` uses the scope already provided to the component body, so
the finalizer above runs when `CounterValue` unmounts.

At the outer boundary, `Counter` is still a normal React component and its Effect requirements remain
typed until they reach the runtime.

[Build the runtime and render your first component →](https://thila.dev/effect-view/docs/getting-started)

## Why Effect View

| | Capability | What it gives you |
| --- | --- | --- |
| **Effect components** | `Component.make` | Yield Effects and typed services directly, then return JSX. |
| **Managed lifecycles** | `Scope.Scope` | Finalizers, fibers, subscriptions, and resources close with their component or dependency lifecycle. |
| **One application runtime** | `ReactRuntime` | Build your Layer once and make its services available throughout the UI. |
| **Reactive state** | `Lens` and `View` | Focus large state models into small writable values and subscribe only where React needs them. |
| **Server state** | `Query` and `Mutation` | TanStack Query-style caching, invalidation, staleness, and mutations with typed Effects underneath. |
| **Schema-driven forms** | `MutationForm` and `LensForm` | Keep input-friendly encoded values while application code receives validated, decoded types. |
| **Async rendering** | `Async` and `Memoized` | Integrate asynchronous Effects with Suspense while retaining Effect errors and cancellation. |

## Designed for both ecosystems

Effect View does not hide Effect behind callbacks or recreate React around a
new rendering model. React still owns rendering, JSX, hooks, Suspense, and
events. Effect owns services, errors, resource safety, concurrency, streams,
and schemas. Effect View provides the lifecycle-aware boundary between them.

## Documentation

The complete documentation is available at **[thila.dev/effect-view](https://thila.dev/effect-view)**.

## Requirements

- React 19.2 or newer
- **Effect v4 beta** (`effect@beta`)
- TypeScript and `@types/react` for TypeScript projects

Effect View is renderer-independent and does not require `react-dom`.

## Project status

Effect View is currently beta software. The main APIs are available, but
breaking changes and rough edges are still possible before a stable release.

Issues, ideas, and contributions are welcome on
[GitHub](https://github.com/Thiladev/effect-view).

## License

[MIT](https://github.com/Thiladev/effect-view/blob/main/LICENSE)
