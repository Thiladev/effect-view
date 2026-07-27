---
sidebar_position: 2
title: State Management
---

# State Management

`Lens` is the main type used for state management in `effect-view`.

A Lens is an effectful handle to a piece of state. It can read the current value,
subscribe to changes, and write updates back to the underlying source. A Lens
can point at a whole state object or focus on one nested field inside it.

`effect-view` re-exports the `Lens` and `View` modules from
[`effect-lens`](https://www.npmjs.com/package/effect-lens/v/beta) for convenience. The
core data model and transformation APIs belong to `effect-lens`, so check the
[`effect-lens` documentation](https://www.npmjs.com/package/effect-lens/v/beta) for the full Lens/View API.

The usual pattern is to create state with Effect primitives such as
`SubscriptionRef`, turn that primitive into a Lens with a matching constructor
such as `Lens.fromSubscriptionRef`, and bind Lens values into components with
`View.useAll`.

`View` is the read-only side of this model. Every Lens is also a View.

## Where To Store State

State can live pretty much anywhere as a `Lens` or `View`: in a
service, in a layer, in a component scope, or alongside plain React state. Pick
the owner based on who needs the state. Once you have a Lens/View
handle, pass it around however you like, including through React props.

If state is shared by multiple components or belongs to application logic, store
it in an Effect service:

```tsx
import { Context, Effect, Layer, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

class CounterState extends Context.Service<
  CounterState,
  { readonly count: Lens.Lens<number> }
>()("CounterState") {
  static readonly layer = Layer.effect(
    CounterState,
    Effect.gen(function*() {
      const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))

      return { count } as const
    }),
  )
}

const CounterValueView = Component.make("CounterValue")(function*() {
  const state = yield* CounterState
  const [count] = yield* View.useAll([state.count])

  return <p>Count: {count}</p>
})
```

If state belongs to a single Effect View component instance, or to a shallow
hierarchy of subcomponents that receive it through props, create it with
`Component.useOnMount`:

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

const LocalCounterView = Component.make("LocalCounter")(function*() {
  const state = yield* Component.useOnMount(() =>
    Effect.gen(function*() {
      const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))

      return { count } as const
    }),
  )
  const [count] = yield* View.useAll([state.count])

  return <p>Count: {count}</p>
})
```

For simple UI state that is not shared and does not need Effect integration,
prefer regular React state. A local "show details" toggle is usually better as
`React.useState(false)` than as a Lens.

## View.useAll

A `View<A>` is reactive state with a current value and a stream of changes. Use
`View.useAll` whenever a component needs to bind View values into render output.

`Lens` is a `View`, so this is also the default way to read Lens values
from a component.

```tsx
import { Context, Effect, Layer, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

class CounterState extends Context.Service<
  CounterState,
  {
    readonly count: Lens.Lens<number>
    readonly doubled: View.View<number>
  }
>()("CounterState") {
  static readonly layer = Layer.effect(
    CounterState,
    Effect.gen(function*() {
      const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))
      const doubled = View.map(count, (n) => n * 2)

      return { count, doubled } as const
    }),
  )
}

const CounterReadOnlyView = Component.make("CounterReadOnly")(
  function* () {
    const state = yield* CounterState
    const [count, doubled] = yield* View.useAll([
      state.count,
      state.doubled,
    ])

    return <p>Count: {count}, doubled: {doubled}</p>
  },
)
```

`View.useAll` reads the current values during render and uses scoped subscriptions to update React state when changes arrive.

When you need to modify state, write to the Lens with `Lens.set` or `Lens.update`:

```tsx
const CounterControlsView = Component.make("CounterControls")(
  function* () {
    const state = yield* CounterState
    const [count] = yield* View.useAll([state.count])

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

If a component only needs to display the value, prefer `View.useAll`.
`Lens.useState` is for places where reading and writing need to be wired
together in React's local-state shape.

```tsx
import { Context, Effect, Layer, SubscriptionRef } from "effect"
import { Component, Lens } from "effect-view"

class FormState extends Context.Service<
  FormState,
  { readonly name: Lens.Lens<string> }
>()("FormState") {
  static readonly layer = Layer.effect(
    FormState,
    Effect.gen(function*() {
      const name = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(""))

      return { name } as const
    }),
  )
}

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
`View.useAll` or used with `Lens.useState` when React needs a
read/write tuple.

```tsx
import { Context, Effect, Layer, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-view"

interface UserProfile {
  readonly name: string
  readonly email: string
  readonly role: string
  readonly contact: {
    readonly address: {
      readonly city: string
    }
  }
}

class ProfileState extends Context.Service<
  ProfileState,
  { readonly profile: Lens.Lens<UserProfile> }
>()("ProfileState") {
  static readonly layer = Layer.effect(
    ProfileState,
    Effect.gen(function*() {
      const profile = Lens.fromSubscriptionRef(
        yield* SubscriptionRef.make<UserProfile>({
          name: "",
          email: "",
          role: "reader",
          contact: {
            address: {
              city: "",
            },
          },
        }),
      )

      return { profile } as const
    }),
  )
}

const ProfileNameView = Component.make("ProfileName")(function*() {
  const state = yield* ProfileState
  const [nameLens, roleLens, cityLens] = yield* Component.useOnMount(() =>
    Effect.succeed([
      Lens.focusObjectOn(state.profile, "name"),
      Lens.focusObjectOn(state.profile, "role"),
      state.profile.pipe(
        Lens.focusObjectOn("contact"),
        Lens.focusObjectOn("address"),
        Lens.focusObjectOn("city"),
      ),
    ] as const),
  )

  const [name, setName] = yield* Lens.useState(nameLens)
  const [role, city] = yield* View.useAll([roleLens, cityLens])

  return (
    <label>
      Name
      <input
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <span>Role: {role}</span>
      <span>City: {city}</span>
    </label>
  )
})
```

The service owns only the root `profile` Lens. The component chooses the fields
it needs, creates those focused Lenses once in `Component.useOnMount`, and
subscribes only to them. Updating `nameLens` through `Lens.useState` still
updates the parent `profile` Lens.

Lens focus helpers have a dual API. They can be called in data-first form, such
as `Lens.focusObjectOn(profile, "name")`, or in curried form with only the key
or index. The `cityLens` above uses the curried form with `pipe` to focus through
a deeper path without storing intermediate Lenses.

For focusing into nested state, deriving lenses, custom write behavior, and the
complete API, refer to the
[`effect-lens` documentation](https://www.npmjs.com/package/effect-lens/v/beta).
