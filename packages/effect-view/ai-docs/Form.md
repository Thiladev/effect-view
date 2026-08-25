# Form

The shared model implemented by both root form types (`MutationForm.md`, `LensForm.md`) and every subform focused from them. A schema is the single source of truth for shape, validation, and the decoded value the application receives; `Form` supplies reactive state and lifecycle on top of it — it does not render anything.

A schema distinguishes the **encoded value** the UI edits from the **decoded value** the application uses:

```tsx
import { Schema } from "effect"

const ProfileSchema = Schema.Struct({
  displayName: Schema.String.check(Schema.isMinLength(1, { message: "Enter a display name" })),
  age: Schema.NumberFromString, // input edits a string, app gets a number
  contact: Schema.Struct({
    email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Enter a valid email" })),
  }),
})
```

## The Form interface

| Member | Meaning |
|---|---|
| `encodedValue` | writable input-shaped state (a `Lens`) |
| `value` | decoded value as `Option<A>`; `None` until decoding succeeds |
| `issues` | Standard Schema issues scoped to this form's path |
| `isValidating` | whether schema decoding is currently running |
| `canCommit` | whether the root has a valid value and is ready to commit |
| `isCommitting` | whether a mutation or target write is in progress |

There is no separate "field" type — a field is just a `Form` focused on part of its parent.

## Focus into subforms

```tsx
const displayNameField = Form.focusObjectOn(form, "displayName")
const contactForm = Form.focusObjectOn(form, "contact")
const emailField = form.pipe(Form.focusObjectOn("contact"), Form.focusObjectOn("email"))
```

- `Form.focusObjectOn` (struct key), `Form.focusArrayAt` (array index), `Form.focusTupleAt` (tuple index), `Form.focusChunkAt` (Chunk index). All are dual API: data-first, or curried for chaining through nested paths with `pipe`.
- A focused form exposes `encodedValue`/`value`/`issues` scoped to that path; `isValidating`/`canCommit`/`isCommitting` stay connected to the root form.
- Focus once (e.g. at component setup), not on every render.

## Bind a subform to an input

```tsx
const input = yield* Form.useInput(emailField, { debounce: "250 millis" })
<input value={input.value} onChange={e => input.setValue(e.currentTarget.value)} />
```

- `Form.useInput(form, { debounce? })` returns `{ value, setValue }` from the subform's encoded value. `setValue` writes the form and re-runs the schema pipeline. `debounce` delays propagation to the form (the displayed value updates immediately) — useful for text inputs to avoid validating every keystroke.
- `Form.useOptionalInput(form, { defaultValue, debounce? })` is for a field whose encoded value is `Option<I>`: returns `{ value, setValue, enabled, setEnabled }` for a togglable optional input. `value`/`setValue` operate on the unwrapped `I`; `defaultValue` is used as `value` while `enabled` is `false` (i.e. while the encoded field is `None`), and `defaultValue` is required.
- `Form.useStatus(form, { debounce? })` returns `{ isValidating, isCommitting, canCommit }`, debounced (default 250ms) to avoid flicker in pending indicators.

These hooks are building blocks for your own reusable input components — wrap them once to handle labels, issues, disabled state, and styling consistently; both hooks accept any `Form.Form`, so the same input component works with subforms from `MutationForm` or `LensForm`.

## Schema-owned conversions

Because the schema defines both directions, it can own an entire domain conversion — e.g. a local `datetime-local` input string decoding to a UTC `DateTime.Utc` and back — with no manual parsing in components. See `MutationForm.md` for a complete example (`DateTimeUtcFromZonedInput`).
