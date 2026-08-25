# ReactRuntime

Owns a managed Effect runtime and exposes it to a React subtree through context. Every effect-view application has exactly one root runtime per independent Effect context tree.

## Create and provide

```tsx
import { Layer } from "effect"
import { ReactRuntime } from "effect-view"

const AppLive = Layer.empty // add application layers here

export const runtime = ReactRuntime.make(AppLive)
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

- `ReactRuntime.make(layer, memoMap?)` builds a `ManagedRuntime` and a `React.Context` in one value. Define it at module scope — never inside a render.
- `ReactRuntime.Provider` builds the runtime layer (which can suspend, hence `fallback`), makes the resulting context available via React context, and disposes the managed runtime on unmount.
- With a router, keep the provider above the router provider. Put a React error boundary above it if runtime construction can fail.

## Rules

- One runtime instance per app (or per independent subtree that needs its own root context).
- `ReactRuntime.Provider` only supplies context; it never builds automatically at other boundaries — `Component.withContext` reads it explicitly.
