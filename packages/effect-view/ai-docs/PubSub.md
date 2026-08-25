# PubSub

Re-exports Effect's `PubSub` module in full (`export * from "effect/PubSub"`) and adds one component hook.

```tsx
const pubsub = yield* Component.useOnMount(() => Effect.acquireRelease(PubSub.unbounded<A>(), PubSub.shutdown))
```

`PubSub.useFromReactiveValues(values: DependencyList)` creates a scoped, unbounded `PubSub` on mount and publishes `values` to it every time the dependency array changes (skipping publish once the PubSub has been shut down). Useful for bridging a set of React-tracked reactive values into an Effect `Stream`-based consumer inside the component's scope.
