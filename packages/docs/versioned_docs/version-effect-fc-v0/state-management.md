---
sidebar_position: 2
title: State Management
---

# State Management

`Lens` is the main type used for state management in `effect-fc`.

A Lens is an effectful handle to a piece of state. It can read the current value,
subscribe to changes, and write updates back to the underlying source. A Lens
can point at a whole state object or focus on one nested field inside it.

The usual pattern is to create state with Effect primitives such as
`SubscriptionRef`, turn that primitive into a Lens with a matching constructor
such as `Lens.fromSubscriptionRef`, and bind Lens values into components with
`Subscribable.useAll`.

`Subscribable` is the read-only side of this model. Every Lens is also a
Subscribable.

`effect-fc` re-exports the `Lens` and `Subscribable` modules from
[`effect-lens`](https://github.com/Thiladev/effect-lens) for convenience. The
core data model and transformation APIs belong to `effect-lens`, so check the
[`effect-lens` documentation](https://github.com/Thiladev/effect-lens/tree/master/packages/effect-lens) for the full Lens/Subscribable API.

## Where To Store State

State can live pretty much anywhere as a `Lens` or `Subscribable`: in a
service, in a layer, in a component scope, or alongside plain React state. Pick
the owner based on who needs the state. Once you have a Lens/Subscribable
handle, pass it around however you like, including through React props.

If state is shared by multiple components or belongs to application logic, store
it in an Effect service:

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, Subscribable } from "effect-fc"

class CounterState extends Effect.Service<CounterState>()("CounterState", {
  effect: Effect.gen(function* () {
    const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))

    return { count } as const
  }),
}) {}

const CounterValueView = Component.make("CounterValue")(function* () {
  const state = yield* CounterState
  const [count] = yield* Subscribable.useAll([state.count])

  return <p>Count: {count}</p>
})
```

If state belongs to a single Effect-FC component instance, or to a shallow
hierarchy of subcomponents that receive it through props, create it with
`Component.useOnMount`:

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, Subscribable } from "effect-fc"

const LocalCounterView = Component.make("LocalCounter")(function* () {
  const state = yield* Component.useOnMount(() =>
    Effect.gen(function* () {
      const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))

      return { count } as const
    }),
  )
  const [count] = yield* Subscribable.useAll([state.count])

  return <p>Count: {count}</p>
})
```

For simple UI state that is not shared and does not need Effect integration,
prefer regular React state. A local "show details" toggle is usually better as
`React.useState(false)` than as a Lens.

## Subscribable.useAll

A `Subscribable<A>` is reactive state with a current value and a stream of
changes. Use `Subscribable.useAll` whenever a component needs to bind
subscribable values into render output.

`Lens` is a `Subscribable`, so this is also the default way to read Lens values
from a component.

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, Subscribable } from "effect-fc"

class CounterState extends Effect.Service<CounterState>()("CounterState", {
  effect: Effect.gen(function* () {
    const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))
    const doubled = Subscribable.map(count, (n) => n * 2)

    return { count, doubled } as const
  }),
}) {}

const CounterReadOnlyView = Component.make("CounterReadOnly")(
  function* () {
    const state = yield* CounterState
    const [count, doubled] = yield* Subscribable.useAll([
      state.count,
      state.doubled,
    ])

    return <p>Count: {count}, doubled: {doubled}</p>
  },
)
```

`Subscribable.useAll` reads the current values during render and uses scoped subscriptions to update React state when changes arrive.

When you need to modify state, write to the Lens with `Lens.set` or `Lens.update`:

```tsx
const CounterControlsView = Component.make("CounterControls")(
  function* () {
    const state = yield* CounterState
    const [count] = yield* Subscribable.useAll([state.count])

    const increment = yield* Component.useCallbackSync(
      () => Lens.update(state.count, (n) => n + 1),
      [],
    )
    const reset = yield* Component.useCallbackSync(
      () => Lens.set(state.count, 0),
      [],
    )

    return (
      <section>
        <p>Count: {count}</p>
        <button onClick={increment}>Increment</button>
        <button onClick={reset}>Reset</button>
      </section>
    )
  },
)
```

## Lens.useState

`Lens.useState` is useful when React needs the familiar `[value, setValue]`
tuple, backed by a Lens. Reach for it when the JSX API expects a synchronous
setter, especially controlled inputs such as text fields, checkboxes, selects,
or third-party components with `value` / `onChange` props.

If a component only needs to display the value, prefer `Subscribable.useAll`.
`Lens.useState` is for places where reading and writing need to be wired
together in React's local-state shape.

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens } from "effect-fc"

class FormState extends Effect.Service<FormState>()("FormState", {
  effect: Effect.gen(function* () {
    const name = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(""))

    return { name } as const
  }),
}) {}

const NameInputView = Component.make("NameInput")(function* () {
  const state = yield* FormState
  const [name, setName] = yield* Lens.useState(state.name)

  return (
    <input
      value={name}
      onChange={(event) => setName(event.currentTarget.value)}
    />
  )
})
```

`Lens.useState` returns the current value and a React-compatible setter. Calling
the setter writes through the Lens, so every other component subscribed to the
same Lens sees the update.

## Focused Lenses

Use focused Lenses when a component should work with one part of a larger state
object. A focused Lens is still a Lens, so it can be read with
`Subscribable.useAll` or used with `Lens.useState` when React needs a
read/write tuple.

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, Subscribable } from "effect-fc"

interface UserProfile {
  readonly name: string
  readonly email: string
  readonly role: string
}

class ProfileState extends Effect.Service<ProfileState>()("ProfileState", {
  effect: Effect.gen(function* () {
    const profile = Lens.fromSubscriptionRef(
      yield* SubscriptionRef.make<UserProfile>({
        name: "",
        email: "",
        role: "reader",
      }),
    )
    const name = Lens.focusObjectOn(profile, "name")
    const role = Lens.focusObjectOn(profile, "role")

    return { profile, name, role } as const
  }),
}) {}

const ProfileNameView = Component.make("ProfileName")(function* () {
  const state = yield* ProfileState
  const [name, setName] = yield* Lens.useState(state.name)
  const [role] = yield* Subscribable.useAll([state.role])

  return (
    <label>
      Name
      <input
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <span>Role: {role}</span>
    </label>
  )
})
```

Updating the focused `name` Lens through `Lens.useState` updates the parent
`profile` Lens. The focused `role` Lens is only read, so it stays on the simpler
`Subscribable.useAll` path.

For focusing into nested state, deriving lenses, custom write behavior, and the
complete API, refer to the
[`effect-lens` documentation](https://github.com/Thiladev/effect-lens/tree/master/packages/effect-lens).
