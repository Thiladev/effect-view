---
sidebar_position: 7
title: Common patterns
---

# Common patterns

Recipes that come up often when building with Effect View.

## A component with its logic as a service

For complex components, it is useful to make rendering the component's only
concern. Its state and operations deserve a name and a test of their own. Put
them in a service defined in the same file as the component, and give the
service to the component with `Component.provide`:

```tsx title="src/Counter.tsx"
import { Context, Effect, Layer, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

const make = Effect.gen(function*() {
  const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))

  return {
    count,
    increment: Lens.update(count, (n) => n + 1),
    reset: Lens.set(count, 0),
  } as const
})

export class CounterService extends Context.Service<CounterService, Effect.Success<typeof make>>()("CounterService") {}
export const layer = Layer.effect(CounterService, make)

export const CounterView = Component.make("CounterView")(function*() {
  const counter = yield* CounterService
  const [count] = yield* View.useAll([counter.count])

  const runSync = yield* Component.useRunSync()

  return (
    <section>
      <p>Count: {count}</p>
      <button onClick={() => runSync(counter.increment)}>Increment</button>
      <button onClick={() => runSync(counter.reset)}>Reset</button>
    </section>
  )
}).pipe(
  Component.provide(layer),
)
```

This only works while the service does not depend on props: `Component.provide` takes a static layer.

The layer is built during render and must acquire synchronously unless the
component is enhanced with [`Async.async`](./async).
