# Effect FC Next error-handling review

## Verdict

`ErrorObserver` is a reasonable *opt-in failure notification bus*, but it is
not an application error handler.  It neither recovers from errors nor, in
`effect-fc-next`, observes the application's effects by default.  Keeping it
as the central error-handling mechanism would make error delivery implicit,
incomplete, and easy to duplicate.

The better model is:

1. Handle expected, typed failures where the operation is rendered or invoked.
2. Report unhandled/background failures through one explicit runtime boundary.
3. Let React error boundaries render defects and render-time failures.

In particular, queries, mutations, and forms should keep their current
`AsyncResult`/validation state as the user-facing error path; a global service
should not replace that state.

## What exists today

`packages/effect-fc-next/src/ErrorObserver.ts` provides a context service
backed by an unbounded `PubSub<Cause.Cause<E>>`:

- `handle(effect)` uses `Effect.tapCause` to publish every non-successful
  cause, then preserves the original result;
- `subscribe` exposes a scoped subscription;
- module-level `handle(effect)` is a no-op when the service is absent.

This is narrower than the similarly named service in the legacy
`packages/effect-fc` package.  The legacy default runtime layer installs an
Effect supervisor that attempts to publish every failed fiber.  The Next
runtime's `preludeLayer` contains only `Component.ScopeMap`; it does not
install `ErrorObserver.layer`.  There are also no `ErrorObserver.handle(...)`
call sites in `effect-fc-next`.

Therefore, as checked at this revision, a consumer can create and subscribe to
the service manually, but no failure is automatically delivered to it.  It is
not currently an app-wide error mechanism.

## What is good about the pattern

- It keeps the original failure intact.  Observability does not accidentally
  turn a failing effect into a successful one.
- It publishes `Cause`, not only `E`, so defects, interruption, parallel
  failures, and traces are not discarded.
- The service is optional, which is useful for a library: applications that do
  not want reporting do not need to install a logger/telemetry dependency.
- A scoped subscription has the right basic lifetime shape for a React
  component or a root-level reporting worker.

## Main issues

### It is opt-in at every execution site

Wrapping effects with `ErrorObserver.handle` is both easy to forget and
ambiguous.  It does not cover failures from `Component.useCallbackPromise`,
`Async.async`, `useReactEffect`, or a fork unless each path explicitly wraps
the relevant effect.  Conversely, adding wrappers at multiple levels reports
the same failure more than once.

### Its type promise is unsound

`handle<A, E1, R>` accepts any `E1` then casts its `Cause<E1>` to
`Cause<E>`.  A value retrieved as `ErrorObserver<NetworkError>` can receive a
`ValidationError` or a defect.  `Cause` is correctly broader than a single
app-error type, but the generic parameter suggests filtering that the service
does not perform.

### "Error" and "handle" blur distinct responsibilities

The code only observes/reports failures; it does not decide a fallback, show a
toast, retry, recover, log, or rethrow.  Calling it a handler encourages using
a global side channel for errors that should remain part of local UI state.

### An unbounded, raw pub/sub is a risky public policy

A slow or absent subscriber can retain an unbounded backlog.  Consumers must
also inspect every `Cause`, decide whether interruption is meaningful, dedupe
retries, redact data, and ensure their own reporting failure does not affect
the application.  Those are application policy choices, not library defaults.

### It is not a React error boundary

React error boundaries cover render/lifecycle errors in the React tree.  They
do not replace reporting of failures from detached/background Effect fibers,
and an Effect failure should not be blindly thrown into render merely to reach
one.  These are complementary boundaries.

## Recommended replacement

Replace the public observer with a small **`FailureReporter`** service.  Make
reporting explicit at the handful of Effect-to-JavaScript runtime boundaries,
not at every business effect.

```ts
interface FailureReporter {
  readonly report: (event: FailureEvent) => Effect.Effect<void>
}

interface FailureEvent {
  readonly cause: Cause.Cause<unknown>
  readonly source: "event" | "effect" | "async-component" | "background"
  readonly componentName?: string
  readonly operation?: string
}
```

The default implementation should be a no-op.  Application layers can add
logging, Sentry/OpenTelemetry, a toast dispatcher, or a bounded in-memory
development sink.  `report` should be made best-effort at the boundary
(`Effect.ignore`/equivalent after recording its own diagnostics) so reporting
outages never replace the original failure.

Provide one internal combinator, for example `reportFailure(effect, metadata)`,
which reports only a non-interruption failure and then re-fails with exactly
the original cause.  Use it in these adapters:

- `Component.useCallbackPromise` and any promise-returning event callback;
- `Component.useReactEffect` / layout-effect execution;
- `Async.async` before the promise is handed to React;
- library-created detached fibers whose failures are not represented in an
  `AsyncResult`.

Do **not** use it for query/mutation/form operations whose failure is already
captured and displayed in `AsyncResult`; report only when the caller abandons
or explicitly escalates that result.  This avoids a failed request producing a
toast/log and an inline error merely because it was expected.

At the application root, pair this with a normal React `ErrorBoundary` that
reports render defects and presents the recovery UI.  Keep its reporting
separate from the Effect service; optionally normalize both into the same
application telemetry event schema.

## Lower-risk incremental path

If replacing the API now is too disruptive:

1. Do not add `ErrorObserver.layer` to the Next prelude merely to make it look
   global.  A hidden global bus still has unclear coverage and duplicate-event
   semantics.
2. Rename `handle` to `observeFailure` and document that it is an explicit
   notification wrapper, not recovery or global supervision.
3. Remove the generic `E`, or expose `Cause.Cause<unknown>`; alternatively
   accept a predicate/decoder that actually filters before publication.
4. Make the queue policy explicit: preferably no public queue, or a bounded,
   dropping development event sink with a dropped-event counter.
5. Add tests for: preservation of the original exit, defects, interruption
   filtering, a failing reporter, duplicate wrapping, and teardown of a scoped
   subscriber.

## Names

`ErrorHandler` is inaccurate, and `ErrorObserver` is acceptable only for the
current low-level notification primitive.  Recommended names by role:

| Role | Recommended name | Why |
| --- | --- | --- |
| Application service that sends telemetry/logs | `FailureReporter` | Says it reports an Effect failure without claiming recovery. |
| Wrapper combinator | `reportFailure` | Describes the side effect and retains the original failure. |
| Optional stream-like dev/testing primitive | `FailureEvents` or `FailureEventBus` | Makes the pub/sub nature explicit. |
| React UI component | `AppErrorBoundary` | Uses React's established boundary terminology. |

I would use **`FailureReporter`** for the replacement.  "Failure" is more
accurate than "error" in Effect because it can intentionally retain the full
`Cause`, while "reporter" makes the non-recovery responsibility clear.

## Decision

Treat `ErrorObserver` as an experimental diagnostic primitive, not the app
error architecture.  Design expected errors into local state, add a
best-effort `FailureReporter` at the few execution boundaries, and use a React
error boundary for render failures.  This gives complete, testable coverage
without turning every domain failure into a global event.
