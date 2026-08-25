# State: Lens and View

`Lens` and `View` are effect-view's state primitives, re-exported in full from [`effect-lens`](https://www.npmjs.com/package/effect-lens/v/beta) with two React hooks added on top (`Lens.useState`, `View.useAll`). The core data model, constructors, and focus/derive API belong to `effect-lens` — consult its docs for anything not covered here.

- **`View<A>`** is the read-only half: a current value plus a stream of changes. Use it for anything a component should only observe (derived/computed state, `Query`/`Mutation` state, a read-only field exposed by a service).
- **`Lens<A>`** is a `View<A>` that can also be written to. Every `Lens` is a `View`, so anywhere a `View` is expected, a `Lens` works too.

## Create state

```tsx
import { SubscriptionRef } from "effect"
import { Lens } from "effect-view"

const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))
```

The usual pattern: build state with an Effect primitive (`SubscriptionRef`), then wrap it as a `Lens` with a matching constructor.

## Where to store it

| Owner | When |
|---|---|
| Effect service (`Context.Service` + `Layer`) | shared by multiple components / application-level state |
| `Component.useOnMount` | owned by one component instance (or a shallow subtree receiving it via props) |
| plain `React.useState` | simple local UI state with no need for Effect integration, subscriptions, or sharing |

```tsx
class CounterState extends Context.Service<CounterState, {
  readonly count: Lens.Lens<number>
  readonly doubled: View.View<number>
}>()("CounterState") {
  static readonly layer = Layer.effect(CounterState, Effect.gen(function* () {
    const count = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(0))
    const doubled = View.map(count, n => n * 2) // derived, read-only
    return { count, doubled } as const
  }))
}
```

## Read: View.useAll

```tsx
const [count, doubled] = yield* View.useAll([state.count, state.doubled])
```

- Reads current values during render, then subscribes via a scoped stream and updates React state on change.
- This is the default way to read a `Lens` too, since `Lens` is a `View`.
- `View.useAll(views, { equivalence? })` — `equivalence` controls when a combined change across the supplied views counts as meaningful (defaults to comparing element-wise with `Equal.strictEqual()`).

## Write

```tsx
yield* Lens.update(state.count, n => n + 1)
yield* Lens.set(state.count, 0)
```

## Lens.useState — read/write tuple for controlled inputs

Use when a JSX API wants React's `[value, setValue]` shape (controlled `<input>`, checkbox, select, third-party `value`/`onChange` props). If a component only needs to *display* the value, prefer `View.useAll` — reach for `Lens.useState` only where reading and writing need to be wired together in React's local-state shape.

```tsx
const [name, setName] = yield* Lens.useState(state.name)
<input value={name} onChange={e => setName(e.currentTarget.value)} />
```

Calling the setter writes through the `Lens`, so every other subscriber (another `Lens.useState`, or a `View.useAll` elsewhere) sees the update. `Lens.useState(lens, { equivalence? })` controls when a change triggers a re-render. The setter accepts a plain value or a `prev => next` updater, same as `React.useState`'s.

## Focused Lenses

A focused Lens is still a `Lens` — read it with `View.useAll` or `Lens.useState` like any other.

```tsx
const nameLens = Lens.focusObjectOn(state.profile, "name")
const cityLens = state.profile.pipe(
  Lens.focusObjectOn("contact"),
  Lens.focusObjectOn("address"),
  Lens.focusObjectOn("city"),
)
```

- Focus helpers (`focusObjectOn`, `focusArrayAt`, `focusTupleAt`, `focusChunkAt`, ...) are dual API: data-first (`Lens.focusObjectOn(lens, key)`) or curried for `pipe` chaining through nested paths.
- Create focused lenses once (e.g. in `Component.useOnMount`), not on every render. Writes through a focused lens propagate to the parent lens.
- Full focus/derive/custom-write API: see the `effect-lens` docs.

## Bridging plain React state into a Lens

`Lens.useFromReactState([value, setValue])` wraps an existing React state tuple as a `Lens`, keeping both directions in sync — useful when integrating a third-party hook that already owns `[value, setValue]` state.
