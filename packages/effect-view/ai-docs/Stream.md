# Stream

Re-exports Effect's `Stream` module in full (`export * from "effect/Stream"`) and adds one component hook for consuming a stream as React state.

```tsx
const latest = yield* Stream.use(someStream)               // Effect<Option<A>, never, R>
const latest = yield* Stream.use(someStream, initialValue) // Effect<Some<A>, never, R>
```

`Stream.use(stream, initialValue?)` subscribes to `stream` for the component's lifetime (via a scoped fiber forked in a post-commit effect) and returns the latest emitted value as React state, deduped with strict equality. Without `initialValue` the result starts as `Option.none()` until the first emission; with one, it starts as `Option.some(initialValue)`.

Prefer `View.useAll` (see `State.md`) when the source is already a `View`/`Lens` — reach for `Stream.use` when you have a raw Effect `Stream` to observe directly.
