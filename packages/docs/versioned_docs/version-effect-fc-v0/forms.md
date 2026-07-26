---
sidebar_position: 3
title: Forms
---

# Forms

The form modules provide an Effect-first model for editable, schema-validated
state. They are not a visual component library. Instead, they give you
Lenses/Subscribables for form values, validation issues, and commit state, so
you can build the UI with whatever components your app already uses.

The base `Form` type represents a field. A field tracks both the raw encoded
value used by inputs and the decoded value produced by an Effect `Schema`:

- `encodedValue`: a `Lens` containing the raw input value.
- `value`: a `Subscribable` containing the decoded value as an `Option`.
- `issues`: a `Subscribable` containing schema validation issues for that field.
- `canCommit`, `isValidating`, and `isCommitting`: `Subscribable` flags for UI
  state.

There are two root form flavors:

- `SubmittableForm`: owns local encoded form state, validates it, and submits a
  decoded value through a mutation.
- `SynchronizedForm`: wraps an existing target `Lens` and writes valid changes
  back to that target.

Most apps create one of those root forms, then focus it into fields with
`Form.focusObjectOn`, `Form.focusArrayAt`, or the other focusing helpers.

The core form model is Effect code and can technically be used outside
Effect-FC. Effect-FC adds the React-facing hooks, such as `Form.useInput`, that
make those forms convenient to bind to components.

## Field Inputs

Use `Form.useInput` to connect a `Form` field to a controlled input. It returns
a React-style `{ value, setValue }` pair and writes changes back to the field's
`encodedValue` Lens.

```tsx
import { Component, Form, Subscribable } from "effect-fc"

const TextInputView = Component.make("TextInput")(
  function* (props: {
    readonly form: Form.Form<readonly PropertyKey[], string, string>
    readonly label: string
  }) {
    const input = yield* Form.useInput(props.form, {
      debounce: "250 millis",
    })
    const [issues] = yield* Subscribable.useAll([props.form.issues])

    return (
      <label>
        {props.label}
        <input
          value={input.value}
          onChange={(event) => input.setValue(event.currentTarget.value)}
        />
        {issues.map((issue) => (
          <small key={issue.path.join(".")}>
            {issue.message}
          </small>
        ))}
      </label>
    )
  },
)
```

Use `Form.useOptionalInput` for `Option` fields. It returns the same value/setter
pair plus `enabled` and `setEnabled`, which is useful for optional inputs that
can be toggled on and off.

## Submittable Forms

Use `SubmittableForm` when the user edits local encoded form state, validates it
with a schema, and then submits a decoded value.

```tsx
import { Effect, Schema } from "effect"
import { Component, Form, SubmittableForm, Subscribable } from "effect-fc"
import { TextInputView } from "./TextInputView"

const RegisterSchema = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
})

class RegisterFormState extends Effect.Service<RegisterFormState>()(
  "RegisterFormState",
  {
    scoped: Effect.gen(function* () {
      const form = yield* SubmittableForm.service({
        schema: RegisterSchema,
        initialEncodedValue: {
          email: "",
          password: "",
        },
        f: ([value]) =>
          Effect.log(`Registering ${value.email}`),
      })

      return {
        form,
        email: Form.focusObjectOn(form, "email"),
        password: Form.focusObjectOn(form, "password"),
      } as const
    }),
  },
) {}

const RegisterFormView = Component.make("RegisterForm")(
  function* () {
    const state = yield* RegisterFormState
    const [canCommit, isCommitting] = yield* Subscribable.useAll([
      state.form.canCommit,
      state.form.isCommitting,
    ])
    const runPromise = yield* Component.useRunPromise()
    const TextInput = yield* TextInputView.use

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void runPromise(state.form.submit)
        }}
      >
        <TextInput label="Email" form={state.email} />
        <TextInput label="Password" form={state.password} />
        <button disabled={!canCommit}>
          {isCommitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    )
  },
)
```

`SubmittableForm.service` starts validation in the form's scope. The form keeps
its encoded input state, decoded value, validation issues, submit mutation, and
commit flags available as Lenses/Subscribables.

## Synchronized Forms

Use `SynchronizedForm` when a form should edit an existing target `Lens`.
Instead of submitting a final value, valid encoded changes are synchronized back
to the target Lens.

This is useful for edit screens where the form is a validated view over existing
state. Use `SubmittableForm` for "submit this draft" flows, and
`SynchronizedForm` for "keep this target state synchronized when valid" flows.

## Focusing Fields

Forms can be focused just like Lenses:

```tsx
const emailField = Form.focusObjectOn(form, "email")
const firstItemField = Form.focusArrayAt(form, 0)
```

Focused fields keep the parent form's validation and commit state, but narrow
`encodedValue`, `value`, and `issues` to the field path. This lets each input
component receive only the field it needs.
