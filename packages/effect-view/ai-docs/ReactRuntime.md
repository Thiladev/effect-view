# ReactRuntime

Owns a managed Effect runtime and exposes it to a React subtree through context. Every effect-view application has exactly one root runtime per independent Effect context tree.

## Create and provide

```tsx
import { Layer } from "effect"
import { ReactRuntime } from "effect-view"

const layer = Layer.empty // add application layers here

export const runtime = ReactRuntime.make(layer)
```

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ReactRuntime } from "effect-view"
import { runtime } from "./runtime"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReactRuntime.Provider runtime={runtime} fallback={<p>Starting...</p>}>
      <App />
    </ReactRuntime.Provider>
  </StrictMode>,
)
```

- `ReactRuntime.make(layer)` creates a `React.Context` and holds the layer. Define it at module scope — never inside a render.
- `ReactRuntime.Provider` builds the runtime layer (which can suspend, hence `fallback`), makes the resulting context available via React context, and disposes the managed runtime on unmount.
- With a router, keep the provider above the router provider. Put a React error boundary above it if runtime construction can fail.

## Extend it for a subtree

Gives a subtree of the app extra services, for React code you don't control. A router renders its routes itself, so a route is a plain component made with `Component.withContext` that reads the root runtime. `Component.provide` / `Component.useLayer` only reach effect-view descendants, so they cannot give services to a child route.

```ts
// user.ts — module scope
export const userRuntime = runtime.extend(CurrentUser.layer)
```

```tsx
// layout route: provide it below the provider of the parent
<ReactRuntime.Provider runtime={userRuntime} fallback={<p>Loading...</p>}>
  <Outlet />
</ReactRuntime.Provider>
```

```tsx
// child route: read it
const EditUser = Component.make("EditUser")(function* () {
  const user = yield* CurrentUser
  return <p>{user.name}</p>
}).pipe(Component.withContext(userRuntime.context))
```

- `runtime.extend(layer)` returns an extended runtime with the same public shape as `ReactRuntime`: `context`, `extend` and `pipe`. Its provider is rendered with `<ReactRuntime.Provider runtime={…}>`, like the root one.
- `layer` can require services of the parent.
- Extended runtimes nest: `userRuntime.extend(DraftService.layer)`.
- The layer is built each time the provider mounts and released after it unmounts (with the usual finalizer debounce). Leaving the subtree and coming back builds it again, so its state resets. Navigating between the routes below the provider keeps the services alive.
- The services of the parent are shared with it, not built again.
- An asynchronous layer suspends the provider: pass `fallback`. A failing layer goes to the nearest error boundary above the provider.
- The provider of the parent must be rendered above the provider of the extended runtime, or it throws.
- The layer is static: it cannot depend on route params or props.
- The services exist only in React. A router loader or `beforeLoad` cannot reach them.

## Rules

- One runtime instance per app (or per independent subtree that needs its own root context). To add services to a subtree of the same app, extend the runtime.
- `ReactRuntime.Provider` only supplies context; it never builds automatically at other boundaries — `Component.withContext` reads it explicitly.
