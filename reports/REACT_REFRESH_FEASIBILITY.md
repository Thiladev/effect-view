# React Fast Refresh for Effect View components

Date: 2026-07-22

## Executive summary

Implementing Fast Refresh for Effect View components is feasible, but it is not a one-line change to React Refresh's component detection.

The current API has two identities:

1. `Component.make` / `Component.makeUntraced` creates an Effect View descriptor.
2. `.use` later synthesizes the React function component that is actually mounted.

Vite's React Refresh transform sees the descriptor definition, while React reconciles the synthesized function. In addition, `.use` deliberately caches that function. A newly evaluated module therefore creates a new descriptor, but the mounted function continues to close over the old descriptor.

The recommended implementation is a bundler-neutral development refresh protocol in Effect View plus a Vite compiler adapter. The plugin should assign stable source IDs and hook signatures to Effect View definitions. The main library's protocol should retain the current descriptor, notify mounted instances after an update, preserve state when the signature is compatible, and remount when it is not. The Vite adapter should retain those cells in `import.meta.hot.data` and manage accept/invalidate behavior.

My feasibility assessment is:

- **Safe refresh with remount on every edit:** high confidence, moderate effort.
- **State-preserving refresh with React-like hook signature handling:** high confidence, moderate-to-high effort.
- **A runtime-only or export-detection-only fix:** not sufficient.
- **Bundler-independent support in the first release:** not recommended; establish the protocol with Vite first.

A production-quality Vite implementation is likely **10–18 engineer-days**, including the runtime bridge, transform, lifecycle tests, examples, and documentation. A remounting proof of concept should take **2–4 days**.

## Scope examined

The implementation target is `effect-view` (Effect 4 beta). The legacy
`effect-fc` package is not supported by the Vite plugin.

## How Effect View rendering works today

`Component.make` creates a function-shaped descriptor with a `body` property and `ComponentPrototype`; it does not create the React component that will be mounted. See [`packages/effect-view/src/Component.ts`](packages/effect-view/src/Component.ts), around `make`, `makeUntraced`, and `ComponentImplPrototype`.

The relevant path is:

```text
source definition
  -> Effect View descriptor (`body`, options, prototype traits)
  -> `.use`
  -> synthesized React function bound to an Effect runtime/context
  -> optional `React.memo` / async transformation
  -> mounted React fiber
```

In `effect-view`, `asFunctionComponent` creates a closure over the descriptor
and Effect context. `.use` retains that synthesized function in `componentRef`
while the relevant Effect service identities remain unchanged, and
`withContext` renders the function returned by `.use`.

This caching is useful during ordinary rendering: without it, React would see a new component type and remount on every parent render. It is also why a newly evaluated module cannot replace the mounted implementation by itself.

## What the current Vite transform does

I inspected Vite's development transform for representative files with the repository's actual configuration and dependency versions.

For a class definition such as `TodosView`, the transform produced the equivalent of:

```js
var _s = $RefreshSig$()
export class TodosView extends _s(
  Component.make("TodosView")(
    _s(function* () {
      _s()
      // component body
    }, "<signature>", false, () => [
      Subscribable.useAll,
      Component.useOnMount,
    ])
  ),
  "<signature>",
  false,
  () => [Subscribable.useAll, Component.useOnMount],
) {}
```

The transform recognizes hook-shaped calls and calculates a signature, but it emits no `$RefreshReg$` call and no refresh boundary for the Effect View. The same was true for `const` definitions created with `Component.make` and for route components ending in `.pipe(Component.withRuntime(...))`.

This happens because `Component.make(...)` and Effect's `pipe(...)` are not React component patterns known to the transform. Class-style Effect Views also inherit from a non-React base, so React Refresh's runtime heuristic deliberately does not classify them as React classes.

Even if export registration were forced, registering the descriptor would not be enough. The descriptor is not the type stored in the mounted React fiber; the lazily synthesized function is.

Consequently, edits currently propagate through ordinary Vite HMR invalidation. Whether they eventually update through an importer or cause a page reload depends on the surrounding module graph and router integration, but React Refresh cannot directly reconcile the edited Effect View family.

## Runtime experiment

The initial feasibility study used the legacy implementation for a focused
jsdom/React identity experiment. Its descriptor-caching result also applies to
`effect-view`, but the legacy package is not an implementation target:

1. Render an Effect View containing `React.useState(0)`.
2. Increment it to `old:1`.
3. Create a replacement descriptor with a body rendering `new:<count>`.
4. Rerender the existing entry component.
5. Copy the replacement `body` onto the descriptor retained by the mounted component and rerender again.

Observed output:

```text
after local state update: old:1
new descriptor, old mounted entry: old:1
mutated descriptor, stable entry: new:1
```

This proves two things:

- Module reevaluation alone cannot update a mounted Effect View because its synthesized function retained the old descriptor.
- Updating the retained implementation and scheduling a render can apply new code while preserving React state.

The experiment was temporary and left no probe files in the repository.

## Required semantics

A complete implementation should provide the same safety contract developers expect from Fast Refresh:

- Apply edits without reloading the page.
- Preserve React state when the hook signature is compatible.
- Remount when hooks are added, removed, reordered, or otherwise become incompatible.
- Recover after a syntax or render error.
- Support both `const` and class definition styles.
- Support local/non-exported child Views, not only module exports.
- Support `make`, `makeUntraced`, `withOptions`, `Memoized.memoized`, async traits, and `withRuntime` / `withContext` entrypoints.
- Work when one View is materialized under multiple Effect service contexts.
- Preserve Effect scopes on compatible edits and close them exactly once on a reset/remount.
- Offer an explicit reset escape hatch equivalent to a refresh-reset directive.

## Recommended design

### 1. Add an Effect View refresh transform

Ship a Vite plugin, `@effect-view/vite-plugin`, placed before `react()`:

```ts
plugins: [
  effectView(),
  react(),
]
```

It should recognize:

- `Component.make(...)`
- `Component.makeUntraced(...)`
- class declarations extending either factory result
- definitions followed by Effect `pipe` transformations
- aliased imports from `effect-view`

For each definition it should inject development-only metadata containing:

- A stable ID based on normalized module path plus local binding.
- A hook signature derived from the generator/body.
- The HMR context or a small generated accept handler.
- Optional reset metadata.

Detection must be binding-aware rather than matching text. Otherwise unrelated `Component.make` functions, renamed imports, and namespace aliases will cause false positives or missed Views.

The plugin must instrument local Views as well as exports. React Refresh works on component families, not only refresh-boundary exports, and most nested Views in this repository are consumed through `.use`.

### 2. Add a development-only hot cell protocol to Effect View

The main library should expose the bundler-neutral cell contract from its `Refreshable` module and the component shell should consume it directly:

```ts
interface HotViewCell {
  current: Component.Any
  revision: number
  resetRevision: number
  signature: string
  subscribe(listener: () => void): () => void
}
```

On module reevaluation, the new descriptor updates `cell.current`. If the signature is unchanged, `revision` changes. If the signature changes, `resetRevision` changes as well.

Keeping the cell rather than only mutating the old descriptor is important for class inheritance and traits. Class-style Views inherit `body` and options through the generated base class, while memoized and async Views alter prototype behavior. A cell can point to the complete new descriptor without attempting to copy an unknown prototype graph onto the old one.

Bundler integrations should depend on this public protocol rather than define a structurally duplicated symbol and cell. The Vite adapter owns only Vite-specific storage in `import.meta.hot.data`, registration IDs, and accept/invalidate decisions.

### 3. Split the development component into a stable shell and keyed implementation

In development, the function materialized by `.use` should become a stable shell:

```text
stable shell
  -> subscribes to HotViewCell
  -> reads current descriptor and resetRevision
  -> renders keyed implementation
       -> runs useScope
       -> runs the current Effect View body
       -> owns the View's React hooks and Effect resources
```

On a compatible edit, the cell subscription rerenders the shell and the implementation keeps the same type/key, preserving state. On an incompatible edit, the key changes and React remounts the implementation safely.

This extra fiber and subscription should exist only in development builds. The production path can remain unchanged.

This design avoids depending on React Refresh's private family maps. It can coexist with the normal Vite React plugin, which remains responsible for standard React components and the error overlay. The Effect View plugin self-accepts only the modules it successfully instruments; unsupported patterns should fall back to normal HMR invalidation rather than accepting an update it cannot apply.

### 4. Reuse or reproduce hook signatures carefully

This is the hardest part of state-preserving support.

The current Vite/OXC transform already sees calls such as `React.useState`, `Component.useOnMount`, and `Subscribable.useAll`, but its computed signature is attached to the descriptor expression rather than the lazily created React function. There is no public runtime API for reading that signature back.

The robust choices are:

1. Run a small binding-aware AST pass that computes Effect View hook signatures and feeds them to the hot cell.
2. Integrate with a public transform hook if Vite/React exposes one in a future version.

Parsing generated OXC text to steal `_s(...)` arguments would be brittle and is not recommended.

An MVP may conservatively remount on every edit. The next step can preserve state only when the plugin can prove that the ordered hook signature is unchanged. False negatives cost state; false positives can violate the Rules of Hooks, so the algorithm must favor remounting.

The signature pass should cover:

- Direct React hooks.
- Effect View hooks named `useX` even when used through `yield*`.
- Imported custom hooks and their identities where possible.
- Hooks introduced by traits such as async rendering.
- An explicit force-reset directive.

### 5. Keep Effect lifecycle behavior explicit

Compatible refresh should retain existing `useOnMount` values and open scopes, just as React Fast Refresh retains hook state. Editing the acquisition code inside `useOnMount` should not silently rerun it unless the View resets.

On a reset, the existing `useScope` effect cleanup should close the old scope and its finalizers. Tests need to account for `finalizerExecutionDebounce` (100 ms by default), Strict Mode, and rapid consecutive edits. The implementation must not create a second close path in the HMR layer.

## Why smaller fixes are insufficient

| Option | Result | Assessment |
| --- | --- | --- |
| Teach Vite that `Component.make` is a component factory | Registers the descriptor, not the mounted synthesized function | Insufficient alone |
| Export every View or rename it to PascalCase | May improve boundary heuristics, but does not bridge the two identities | Insufficient |
| Wrap only route entrypoints with a normal React component | Can refresh the entry wrapper, but nested `.use` components still retain old implementations and state may remount | Partial workaround |
| Remove caching from `.use` | New type on every ordinary render; all child Views remount continuously | Incorrect |
| Mutate the old descriptor in a manual HMR handler | Demonstrably updates code and can preserve state, but lacks scheduling, hook safety, class/trait handling, and ergonomics | Useful prototype only |
| Register every synthesized function directly with React Refresh | Possible, but needs stable IDs per materialization, replacement creation for every Effect context, signature propagation, and private/runtime coupling | Viable but more coupled |
| Stable hot cell plus development shell | Explicitly bridges identities and controls preserve-versus-reset behavior | Recommended |
| Redesign Effect Views to be ordinary React component types | Makes React Refresh natural, but conflicts with context binding through `.use` and is a large API/architecture change | Not justified for this feature |

## Proposed delivery plan

### Phase 0: executable spike (2–4 days)

- Instrument one `const` View and one class View in the example app.
- Retain a hot cell in `import.meta.hot.data`.
- Refresh with a guaranteed remount.
- Verify edits through a nested `.use` View and a `withRuntime` / `withContext` route.
- Verify a finalizer runs exactly once on reset.

Exit criterion: editing render text updates without a page reload, and incompatible edits remount safely.

### Phase 1: Vite MVP (4–7 additional days)

- Implement binding-aware AST detection for all public construction styles.
- Add stable shell/keyed implementation support to the supported `effect-view` Component implementation.
- Cover memoized and async traits.
- Add safe self-accept/fallback behavior.
- Add browser integration tests against the example app.

Exit criterion: all supported Effect View forms refresh reliably, initially with conservative remounting where signature information is unavailable.

### Phase 2: state preservation (4–7 additional days)

- Compute ordered hook signatures.
- Preserve local state for compatible edits.
- Reset for hook-order changes and the force-reset directive.
- Test custom hooks, multiple service contexts, syntax-error recovery, and rapid edits.
- Document expected `useOnMount` and scope behavior.

Exit criterion: the behavior matches React Fast Refresh closely enough that state preservation is predictable and hook-safe.

### Later: other bundlers

Because the main Effect View library owns the runtime metadata protocol, adapters for webpack/Rspack, Rolldown, or other environments can emit the same metadata without depending on Vite. Building those in parallel with the first Vite version would enlarge the test matrix before the semantics have settled.

## Test matrix

The feature should have real browser HMR tests; unit tests cannot fully validate React Refresh scheduling and module replacement.

Minimum cases:

- `const` and class View definitions.
- `make` and `makeUntraced`.
- Root entrypoint and nested `.use` child.
- A View imported through another module.
- Local, exported, default-exported, and renamed Views.
- Direct React state preserved after a render-only edit.
- State reset after adding/removing/reordering a hook.
- `useOnMount`, `useOnChange`, `useReactEffect`, and `useReactLayoutEffect` cleanup.
- Default and zero finalizer debounce.
- Memoized View with unchanged props.
- Async View and Suspense/error recovery.
- Two materializations of the same View under different Effect contexts.
- Reactive and `nonReactiveTags` service changes.
- TanStack Router code splitting used by the `example` application.
- Successive edits before the previous refresh finishes.
- Syntax error followed by recovery.
- Production build contains no HMR registry/subscription code.

## Risks and open questions

### Hook signature ownership

The plugin must decide which `useX` calls represent React hook state. Effect View intentionally makes React hooks appear inside generator bodies, so relying only on standard React source patterns will remain incomplete.

### Trait composition

`Memoized.memoized`, async behavior, `withOptions`, and future traits can replace `transformFunctionComponent` or alter prototypes. The hot cell should point to the newest complete descriptor, and the development shell must define whether a trait change is compatible or forces reset.

### Development tree shape

A stable shell plus keyed implementation adds one fiber in development. This is a reasonable tradeoff, but React DevTools naming should make the extra layer understandable.

### React/Vite version coupling

The current plugin stack uses Vite's OXC refresh transform and a bundled/simplified React Refresh runtime. Depending on private runtime functions or generated transform text would make the feature sensitive to Vite upgrades. The main Effect View package should therefore own the standalone metadata protocol, while the Vite plugin depends on and adapts it.

### Multiple materializations

One View definition can produce more than one function identity because `.use` is evaluated under different Effect service sets and parent instances. A solution based on direct React Refresh registration must track every materialization. The hot-cell subscription model naturally fans one update out to all mounted materializations.

### Resource expectations

Preserving state also preserves acquired resources. Developers will need a reset directive or a documented way to force a remount when they edit acquisition logic and want it rerun immediately.

## Recommendation

Proceed with a Vite-first proof of concept using a stable hot cell and a development-only stable shell/keyed implementation.

Do not begin by patching component-name heuristics or by registering the Effect View descriptor with React Refresh; those changes target the wrong identity. Also avoid coupling the initial implementation to private React Refresh family maps.

The first milestone should always remount safely. Once browser tests prove update delivery and Effect scope cleanup, add signature-aware state preservation. This order isolates the HMR transport/identity problem from the hook-compatibility problem and gives the project a useful, releasable intermediate result.
