# effect-view

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
