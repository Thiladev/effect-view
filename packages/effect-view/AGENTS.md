# effect-view

`effect-view` lets a React function component be described as an Effect program: yield services, create scoped resources, subscribe to reactive state, and turn Effects into React callbacks inside a component body, then convert that description into a normal React function component at a React boundary.

Requires Effect v4 (RC) and React 19.2+. Peer dependencies: `effect`, `react`, `@types/react`. Not tied to `react-dom` — any React renderer works.

When writing effect-view code, use the actual current source and tests in `src/` as ground truth over anything remembered from training — the API is pre-1.0 and still moving. The files below are a concise reference; read the linked one(s) before writing code that touches that concern.

## Core model

1. `ReactRuntime` builds the Effect services available to the UI and exposes them through React context.
2. `Component.make` defines a component body as an Effect generator.
3. `Component.withContext` converts a `Component` into a normal React component at a React boundary (app root, router, third-party library). Apply it only there — never between two effect-view components.
4. Inside another effect-view component, compose children by yielding their `.use` Effect.
5. Every rendered component instance owns a root `Scope.Scope`, opened on mount and closed on unmount; regular component setup must complete **synchronously** during render unless the component is wrapped with `Async.async`.

## Find the right doc by what you're trying to do

**Setting up the app** — building the runtime, providing it to the tree → [ReactRuntime.md](./ai-docs/ReactRuntime.md)

**Defining a component, its lifecycle, or running Effects from event handlers** → [Component.md](./ai-docs/Component.md)

**Storing, reading, or subscribing to state** (local, shared via a service, or focused into a nested field) → [State.md](./ai-docs/State.md) — `Lens` (read/write) and `View` (read-only)

**Rendering something that needs to wait on an async Effect, or avoiding unnecessary re-renders/re-fetches** → [Async.md](./ai-docs/Async.md) — `Async` (suspend on an Effect) and `Memoized` (`React.memo` wrapper)

**Fetching/caching server data** (reactive keys, staleness, background refresh, invalidation) → [Query.md](./ai-docs/Query.md) — includes `QueryClient`, the cache service `Query` runs against

**Triggering a write** (save, delete, upload, send) with pending/error state → [Mutation.md](./ai-docs/Mutation.md)

**Building a schema-driven form**:
- shared concepts (encoded vs decoded value, focusing into fields, input/status hooks) → [Form.md](./ai-docs/Form.md) — read this first
- a form that submits a valid value via a `Mutation` → [MutationForm.md](./ai-docs/MutationForm.md)
- a form that keeps a target `Lens` continuously synchronized with a valid draft → [LensForm.md](./ai-docs/LensForm.md)

**Small utilities**:
- bridging React-tracked values into an Effect `PubSub` → [PubSub.md](./ai-docs/PubSub.md)
- consuming a raw Effect `Stream` as React state → [Stream.md](./ai-docs/Stream.md)

## Choosing between async integrations

- One-off async read before rendering → `Async.async`.
- Cached/shared/refreshable server reads → `Query`.
- User-triggered writes with observable pending/error state → `Mutation`.
- Async work in an event handler with no need for `Mutation` state → `Component.useRunPromise`/`useCallbackPromise`.
- Subscriptions or background work tied to component lifecycle → a scoped fiber forked from `Component.useReactEffect`.

## Common pitfalls

- Never yield an asynchronous Effect directly from a regular (non-`Async`) component body.
- effect-view hooks are still React hooks under the hood: call them unconditionally, at the top level, in a stable order — never in branches, loops, or after a suspend point.
- Keep `ReactRuntime` instances and `Layer` references stable; building them during render creates new resources and a new React context every time.
- `Component.withContext` requires a matching `ReactRuntime.Provider` above it in the tree.
