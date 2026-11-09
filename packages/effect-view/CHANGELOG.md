# effect-view

## 0.4.0

### Minor Changes

- [`daca44d`](https://git.valverde.cloud/Thilawyn/effect-view/commit/daca44dbe42d1109a1096a0389c5b7ba6cf939c7) - **Breaking (types only):** `Component` no longer includes `Scope.Scope` in its `R` type parameter.

  Every component instance is given its own `Scope` when it renders, so the component doesn't require one from its parent — it is provided to the body. `Component.Context`, `use` and `withContext` now reflect that, and `make` / `makeUntraced` strip `Scope.Scope` from the inferred context. The `body` property is typed `Effect<A, E, R | Scope.Scope>`. There is no runtime change.

  ```ts
  const Timer = Component.make("Timer")(function* () {
      yield* Effect.forkScoped(tick)
      return <div />
  })

  // Before
  type Context = Component.Component.Context<typeof Timer> // Scope.Scope

  // After
  type Context = Component.Component.Context<typeof Timer> // never
  ```

  Code that explicitly names `Scope.Scope` in a component's `R` (for example `Component<P, A, E, Scope.Scope | Foo, F>`, or the `Scope.Scope |` workaround for `withContext`) should drop it.

- [`ccf38a3`](https://git.valverde.cloud/Thilawyn/effect-view/commit/ccf38a304cf6a505433df9f6cb17e4f9dade756a) - **Breaking:** `ReactRuntime.Provider` now builds the runtime of its `ReactRuntime` each time it mounts, and releases it when it unmounts. A provider that is mounted again builds the layer again.

  As a consequence, a `ReactRuntime` no longer holds a `ManagedRuntime`: `runtime.runtime` is removed, and `ReactRuntime.make` no longer takes a `memoMap`. To run Effects outside of React, build your own `ManagedRuntime` from the layer.

  ```ts
  // Before
  const runtime = ReactRuntime.make(layer)
  runtime.runtime.runPromise(effect)

  // After
  const runtime = ReactRuntime.make(layer)
  const managed = ManagedRuntime.make(layer)
  managed.runPromise(effect)
  ```

- [`4e647de`](https://git.valverde.cloud/Thilawyn/effect-view/commit/4e647dea15ab9d385673d44d8f8785f6267d6918) - Add `runtime.extend(layer)` to `ReactRuntime`, to give a subtree of the application its own services, for example a router layout and its routes.

  The extended runtime is a `ReactRuntime`: render its `Provider` below the one of its parent, and read it from the routes with `Component.withContext(component, extended.context)`. Its layer can require the services of the parent, which are shared with it and not built again. It is built each time its `Provider` mounts and released when it unmounts, so leaving the subtree and coming back builds it again. It can be extended again.

  ```tsx
  const userRuntime = runtime.extend(CurrentUser.layer)

  const UserLayout = Component.make("UserLayout")(function* () {
      return (
          <ReactRuntime.Provider runtime={userRuntime}>
              <Outlet />
          </ReactRuntime.Provider>
      )
  }).pipe(Component.withContext(runtime.context))

  export const Route = createFileRoute("/user/edit")({
      component: Component.withContext(EditUser, userRuntime.context),
  })
  ```

- [`dd451d8`](https://git.valverde.cloud/Thilawyn/effect-view/commit/dd451d89cad8b2b15bbdd5c37c285bdf0bf65139) - `Component.withContext` and the `Provider` of an extended runtime throw a clear error when there is no matching `Provider` above them.

- [`13e1423`](https://git.valverde.cloud/Thilawyn/effect-view/commit/13e14230cc4fb89f5cc1703d83d5fe64a562d580) - Fix the scope of a component hidden by `React.Activity`. If its scope was closed while it was hidden, showing it again now replaces the scope, and what was created in it (`useOnChange`, `useOnMount`, `Component.provide`...) is created again instead of being left closed.

- [`b4cb10b`](https://git.valverde.cloud/Thilawyn/effect-view/commit/b4cb10b37a6c3b08a434882dbfff6f79ff6d72f0) - `ScopeRegistry`: `dispose` now waits for the scopes that are being closed, but no longer than `finalizerTimeout`, and a failing finalizer is logged instead of preventing the other scopes from closing. The registry follows its own clock, which ignores the system time going backwards.

  **Breaking (low-level):** `ScopeRegistry.make` is now a function taking the options (`ScopeRegistry.make()` instead of `ScopeRegistry.make`), and the `ref` of the service is a `Ref` instead of a `SubscriptionRef`. Use `ScopeRegistry.layerWithOptions` to provide a registry with options.

- [`4c5afcc`](https://git.valverde.cloud/Thilawyn/effect-view/commit/4c5afccc49ed23a2fd64ce7a333e5c03f0ef3ccf) - **Breaking (low-level):** `Refreshable.Cell` holds the `body` of the component instead of the whole descriptor (`current`), and `RefreshablePrototype` is removed. The body of a refreshable component subscribes to the cell itself. This is only relevant for development-server integrations; `@effect-view/vite-plugin` 0.4.0 is updated accordingly.

## 0.3.0

### Minor Changes

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - Fix race conditions in `Query` and `Mutation`.

  These were most visible on React Native, where scheduling made them easy to hit:

  - A request's final state could be lost, leaving `state` stuck on `waiting: true` and the result out of the cache.
  - A superseded request could overwrite the state of a newer one, or be recorded in `latestFinalState` while still waiting.
  - Concurrent `fetch`/`refresh` calls superseding a running request could leave an extra request running that was never interrupted.

  Each run of a Query or Mutation is now an `Operation` (new `Operation` module), and only the current one updates `state` and `latestFinalState`.

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - **Breaking:** replace `fetchView`, `refreshView` and `mutateView` with `fetchStream`, `refreshStream` and `mutateStream`.

  They start the request the same way, but return a `Stream` of that request's states instead of a `View`. The stream emits the current state first, so subscribing late still yields the final state, then ends once the request settles or is interrupted. Consume it in a component with `Stream.use`.

  ```ts
  // Before
  runSync(query.refreshView)
  runSync(mutation.mutateView(input))

  // After
  runSync(query.refreshStream)
  runSync(mutation.mutateStream(input))
  ```

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - **Breaking:** a `fetch` or `refresh` superseded by a newer request is now interrupted, instead of returning its unfinished state typed as final. Its state goes back to the previous result, no longer waiting.

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - **Breaking:** remove `fiber` from `Query` and `Mutation`. Use the new `operation` View instead, which holds the current `Operation` (its `key`, `state`, `stream`, `fiber`, `interrupt` and `await`).

  ```ts
  // Before
  const fiber = yield* View.get(query.fiber)

  // After
  const operation = yield* View.get(query.operation)
  if (Option.isSome(operation)) yield* operation.value.interrupt
  ```

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - **Breaking:** rename `FinalQueryState` to `QueryFinalState`, `FinalMutationState` to `MutationFinalState`, and `LatestMutationState` to `MutationLatestState`. Remove `QueryStateLens`, `makeQueryStateLens`, `MutationStateLens` and `makeMutationStateLens`.

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - **Breaking:** when mutations overlap, `mutation.state` and `latestFinalState` now follow only the most recently started call. Earlier calls still run to completion but no longer update them. Use `mutateStream` to follow each call separately.

- [`acb05fc`](https://git.valverde.cloud/Thilawyn/effect-view/commit/acb05fce44c6e67a9924ce878f20e39a4f59af71) - **Breaking:** `QueryClient.layer` is now a `Layer` using the default options. Use `QueryClient.layerWithOptions` to pass options.

  ```ts
  // Before
  QueryClient.layer()
  QueryClient.layer({ defaultStaleTime: "30 seconds" })

  // After
  QueryClient.layer
  QueryClient.layerWithOptions({ defaultStaleTime: "30 seconds" })
  ```

- [`2ed417a`](https://git.valverde.cloud/Thilawyn/effect-view/commit/2ed417a49f283c120af4034d1a496d3fe304dd05) - Add offline support to `Query`, like TanStack Query's `networkMode`.

  - The new `networkMode` option (`Operation.NetworkMode`) is `"online"` by default: a request made offline waits for a connection before running, and its state has `paused: true` meanwhile, with `result.waiting` still `true`. With `"offlineFirst"`, a request runs right away, and if it fails while offline, it is paused until the connection returns, then runs again. With `"always"`, requests ignore the connection.
  - The new `refreshOnReconnect` option refreshes the current key when the connection returns, subject to `staleTime`. It defaults to `true`, except in `"always"` mode.
  - `refreshOnFocus` and `refreshOnReconnect` accept `"always"`, to refresh even a fresh result (`Query.RefreshOn`).
  - `QueryClient` takes the matching defaults: `defaultNetworkMode` and `defaultRefreshOnReconnect`.
  - Focus and reconnect refreshes no longer restart a request that is already running, and a paused request resumes by itself.

  The connection status comes from the new `AppConnectivity` service, and focus from the new `AppFocus` service. Each module provides `layerBrowser` (`navigator.onLine` with the `online`/`offline` events, and the page's visibility, like TanStack Query), `layerDummy` (always online or focused, e.g. for tests) and `make(view)` to build the service from any `View<boolean>`, e.g. on React Native.

- [`79d9061`](https://git.valverde.cloud/Thilawyn/effect-view/commit/79d906190754193b1b86bd07cd176d402180509f) - **Breaking:** `Mutation` takes a `networkMode` option too, defaulting to the client's new `defaultMutationNetworkMode` (`"online"` by default). In the default `"online"` mode, mutations called offline are now paused until the connection returns. `Mutation.make` (and `MutationForm.make`) now require a `QueryClient`.

- [`2ed417a`](https://git.valverde.cloud/Thilawyn/effect-view/commit/2ed417a49f283c120af4034d1a496d3fe304dd05) - **Breaking:** `QueryClient.layer` and `QueryClient.layerWithOptions` now require the `AppConnectivity` and `AppFocus` services. In a browser, use `QueryClient.layerBrowser` and `QueryClient.layerBrowserWithOptions`, which provide both.

  ```ts
  // Before
  QueryClient.layer
  QueryClient.layerWithOptions({ defaultStaleTime: "30 seconds" })

  // After, in a browser
  QueryClient.layerBrowser
  QueryClient.layerBrowserWithOptions({ defaultStaleTime: "30 seconds" })

  // After, elsewhere
  QueryClient.layer.pipe(
    Layer.provide(Layer.mergeAll(AppConnectivity.layerDummy, AppFocus.layerDummy)),
  )
  ```

- [`2ed417a`](https://git.valverde.cloud/Thilawyn/effect-view/commit/2ed417a49f283c120af4034d1a496d3fe304dd05) - **Breaking:** rename `refreshOnWindowFocus` to `refreshOnFocus`, and `defaultRefreshOnWindowFocus` to `defaultRefreshOnFocus`. Focus is now read from the `AppFocus` service instead of the window directly, so it can be provided on any platform.

  ```ts
  // Before
  Query.make({ key, f, refreshOnWindowFocus: false })
  QueryClient.layerWithOptions({ defaultRefreshOnWindowFocus: false })

  // After
  Query.make({ key, f, refreshOnFocus: false })
  QueryClient.layerBrowserWithOptions({ defaultRefreshOnFocus: false })
  ```

- **Breaking:** like TanStack Query's `refetchInterval`, `Query.withScheduledRefresh` now skips refreshes while the app is not focused, as reported by the `AppFocus` service. A skipped refresh still counts toward the schedule. Pass `refreshInBackground: true` to keep the previous behavior.

  ```ts
  Query.withScheduledRefresh(Schedule.spaced("5 minutes"), { refreshInBackground: true })
  ```

### Patch Changes

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - Serving a fresh result from the cache no longer resets that cache entry's staleness timer.
