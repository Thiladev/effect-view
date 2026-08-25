# MutationForm

A root form (implements `Form.Form`, see `Form.md`) that owns a local encoded draft and passes the valid decoded value to a `Mutation` when `submit` runs. Use for registration, checkout, search — any workflow with an explicit submit action.

```tsx
import { Effect } from "effect"
import { Component, MutationForm, View } from "effect-view"

const form = yield* Component.useOnMount(() =>
  MutationForm.make({
    schema: ProfileSchema,
    initialEncodedValue: { displayName: "", age: "", contact: { email: "" } },
    f: ([profile, form]) => Effect.log(`Creating ${profile.displayName}, age ${profile.age}`),
  }).pipe(MutationForm.thenRun),
)

const [canCommit, isCommitting] = yield* View.useAll([form.canCommit, form.isCommitting])
const runPromise = yield* Component.useRunPromise()

<button disabled={!canCommit || isCommitting} onClick={() => void runPromise(form.submit)}>
  {isCommitting ? "Creating..." : "Create profile"}
</button>
```

- `MutationForm.make({ schema, initialEncodedValue, f })` constructs the form; the underlying `Mutation`'s input key is the tuple `[decodedValue, form]`, not just the decoded value. Most `f` implementations only destructure the first element (`profile.age` is a number even though the input edited a string); `form` is included so `f` can, if needed, read other form state (e.g. `form.issues`, `form.encodedValue`) while handling the submission. `MutationForm.thenRun` starts initial validation in the current scope.
- Create once and keep stable — the usual home is `Component.useOnMount`.
- `form.submit` runs the mutation only when the form can currently commit; schema issues block submission before the mutation ever runs.
- Focus into subforms/fields with `Form.focusObjectOn`/`focusArrayAt`/etc. (see `Form.md`) and bind them to inputs with `Form.useInput`.
- If `f` fails with a `Schema.SchemaError`, `form.submit` formats that error into `form.issues` automatically — the same formatting path used for client-side decoding errors — instead of only surfacing it as a mutation failure. Any other failure from `f` is left as the mutation's `Failure` and does not touch `form.issues`.

## Example: schema-owned date conversion

```tsx
class DateTimeUtcFromZoned extends Schema.transformOrFail(Schema.DateTimeZonedFromSelf, Schema.DateTimeUtcFromSelf, {
  strict: true,
  decode: input => ParseResult.succeed(DateTime.toUtc(input)),
  encode: DateTime.setZoneCurrent,
}) {}

export class DateTimeUtcFromZonedInput extends Schema.transformOrFail(Schema.String, DateTimeUtcFromZoned, {
  strict: true,
  decode: (input, _options, ast) => Effect.flatMap(DateTime.CurrentTimeZone, timeZone =>
    Option.match(DateTime.makeZoned(input, { timeZone, adjustForTimeZone: true }), {
      onSome: ParseResult.succeed,
      onNone: () => ParseResult.fail(new ParseResult.Type(ast, input, "Enter a valid date and time")),
    })),
  encode: value => ParseResult.succeed(DateTime.formatIsoZoned(value).slice(0, 16)),
}) {}
```

An `<input type="datetime-local">` edits `"2026-07-22T14:30"`; the schema decodes it to a UTC `DateTime.Utc` (`decode(...).pipe requires DateTime.CurrentTimeZone` — provide `DateTime.layerCurrentZoneLocal` in the runtime) and the mutation receives the UTC instant directly. No manual date parsing in the component.
