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

### Patch Changes

- [`3875bc4`](https://git.valverde.cloud/Thilawyn/effect-view/commit/3875bc4f691dfa670137142e3bd62c226f9f5886) - Serving a fresh result from the cache no longer resets that cache entry's staleness timer.
