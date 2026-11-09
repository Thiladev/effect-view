# `@effect-view/vite-plugin`

Experimental Vite Fast Refresh support for Effect View components.

```ts
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

The plugin recognizes `Component.make` and `Component.makeUntraced`
definitions imported from `effect-view`. The legacy `effect-fc` package is
not supported. `effect-view` owns the bundler-neutral refresh cell protocol;
this package is the Vite adapter that retains those cells in HMR data. The
plugin assigns stable development IDs and self-accepts successfully
instrumented modules.

The adapter-facing protocol is exported from `effect-view/Refreshable`.

Renaming or removing an instrumented View invalidates the module upward instead
of leaving a stale mounted descriptor.

React state is retained when the ordered hook signature is unchanged. Adding,
removing, or changing a hook call resets the Effect View implementation. Add
`// @refresh reset` to a module to reset its Views on every update.

## Current limitations

- Definitions must be top-level variable, class, or default-export
  declarations.
- Hook signature analysis is conservative and based on `useX` call syntax.
- Only the body of a component is refreshed. Changing what is applied to the
  descriptor afterwards (adding `Async.async`, changing the options of
  `Component.withOptions`, the layer of `Component.provide`...) takes effect
  when the descriptor is created again, that is after a full reload.
- A factory call must have its function inline (`Component.make("Name")(function*() {})`).
- Source maps for the injected transform are not generated yet.
