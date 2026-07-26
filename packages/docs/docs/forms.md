---
sidebar_position: 5
title: Forms
---

# Forms

Effect View forms are built from an Effect `Schema`. The schema is the source of
truth for the shape of the form, its validation rules, and the value your
application receives. The form layer supplies reactive state and lifecycle; it
does not replace your UI components.

A schema distinguishes the **encoded value** edited by the UI from the
**decoded value** used by the application. For example, an `<input>` edits an
age as a string, while the submit handler or application state receives a
number:

```tsx
import { Schema } from "effect"

const ProfileSchema = Schema.Struct({
  displayName: Schema.String.check(
    Schema.isMinLength(1, { message: "Enter a display name" }),
  ),
  age: Schema.NumberFromString,
  contact: Schema.Struct({
    email: Schema.String.check(
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: "Enter a valid email address",
      }),
    ),
  }),
})
```

That schema gives the form several useful properties:

- Validation stays next to the data definition instead of being duplicated in
  components and submit handlers.
- Inputs can keep UI-friendly encoded values while business logic receives
  decoded, typed values.
- Nested schema issue paths can be routed automatically to the matching
  subform or field.
- Synchronous and effectful schema validation use the same form model.
- The same schema can validate a local draft or protect writes to shared state.

There are two concrete root form implementations. Choose one based on where a
valid decoded value should go:

| Implementation | Owns a local draft | What happens to a valid value |
| --- | --- | --- |
| `MutationForm` | Yes | It is passed to a mutation when `submit` runs. |
| `LensForm` | Yes | It is written automatically to a target `Lens`. |

## MutationForm: validate, then submit

Use `MutationForm` for registration, checkout, search, and other workflows with
an explicit submit action. It owns the encoded draft, continuously decodes it
with the schema, and exposes the last valid decoded value. Calling `submit`
runs the mutation only when the form can commit.

```tsx
import { Effect } from "effect"
import { Component, MutationForm, View } from "effect-view"

const CreateProfileView = Component.make("CreateProfile")(function* () {
  const form = yield* Component.useOnMount(() =>
    MutationForm.service({
      schema: ProfileSchema,
      initialEncodedValue: {
        displayName: "",
        age: "",
        contact: { email: "" },
      },
      f: ([profile]) =>
        Effect.log(
          `Creating ${profile.displayName}, age ${profile.age}`,
        ),
    }),
  )

  const [canCommit, isCommitting] = yield* View.useAll([
    form.canCommit,
    form.isCommitting,
  ])
  const runPromise = yield* Component.useRunPromise()

  // Focused inputs are added in "Focus into subforms" below.
  return (
    <button
      disabled={!canCommit || isCommitting}
      onClick={() => void runPromise(form.submit)}
    >
      {isCommitting ? "Creating..." : "Create profile"}
    </button>
  )
})
```

Notice that `age` starts as a string because it is an encoded input value. The
mutation receives the schema's decoded profile, so `profile.age` is a number.
Schema transformations happen before the mutation and schema issues prevent an
invalid draft from being submitted.

`MutationForm.service` also starts initial validation in the current scope. Use
it inside `Component.useOnMount`, a scoped service, or another Effect scope so
its validation and mutation work is cleaned up with its owner.

## LensForm: validate, then synchronize

Use `LensForm` for settings panels, inspectors, and edit screens where valid
changes should update existing state without a final submit. Its target holds
decoded application data; the form derives an encoded draft from that target
and keeps the two synchronized in both directions.

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, LensForm, View } from "effect-view"

const EditProfileView = Component.make("EditProfile")(function* () {
  const [form, profile] = yield* Component.useOnMount(() =>
    Effect.gen(function* () {
      const profile = Lens.fromSubscriptionRef(
        yield* SubscriptionRef.make({
          displayName: "Ada",
          age: 37,
          contact: { email: "ada@example.com" },
        }),
      )

      const form = yield* LensForm.service({
        schema: ProfileSchema,
        target: profile,
      })

      return [form, profile] as const
    }),
  )

  const [savedProfile, isCommitting] = yield* View.useAll([
    profile,
    form.isCommitting,
  ])

  // Focused inputs are added in "Focus into subforms" below.
  return (
    <output>
      {isCommitting
        ? "Saving..."
        : `${savedProfile.displayName} is ${savedProfile.age}`}
    </output>
  )
})
```

Here the target contains `age: 37`, while the form exposes the encoded value
`age: "37"` to an input. A valid edit is decoded and written to `profile`.
Invalid input remains in the form so the user can correct it, but it never
reaches the target. If another part of the application updates the target,
`LensForm` encodes that value back into the draft.

Pass `initialEncodedValue` only when the first draft should differ from the
encoded target. Otherwise `LensForm.service` obtains the initial draft by
encoding the target through the schema.

## Example: local date input, UTC domain value

The encoded/decoded distinction is especially useful for dates. An HTML
`datetime-local` input produces a wall-clock string such as
`"2026-07-22T14:30"`. It contains no time-zone or UTC offset, while application
state and APIs usually need an unambiguous UTC instant.

A schema can own that entire conversion. The following schema interprets the
input in the current time zone and decodes it to `DateTime.Utc`:

```tsx title="src/DateTimeUtcFromZonedInput.ts"
import { DateTime, Effect, Option, ParseResult, Schema } from "effect"

class DateTimeUtcFromZoned extends Schema.transformOrFail(
  Schema.DateTimeZonedFromSelf,
  Schema.DateTimeUtcFromSelf,
  {
    strict: true,
    decode: (input) => ParseResult.succeed(DateTime.toUtc(input)),
    encode: DateTime.setZoneCurrent,
  },
) {}

export class DateTimeUtcFromZonedInput extends Schema.transformOrFail(
  Schema.String,
  DateTimeUtcFromZoned,
  {
    strict: true,
    decode: (input, _options, ast) =>
      Effect.flatMap(DateTime.CurrentTimeZone, (timeZone) =>
        Option.match(
          DateTime.makeZoned(input, {
            timeZone,
            adjustForTimeZone: true,
          }),
          {
            onSome: ParseResult.succeed,
            onNone: () =>
              ParseResult.fail(
                new ParseResult.Type(
                  ast,
                  input,
                  "Enter a valid date and time",
                ),
              ),
          },
        ),
      ),
    encode: (value) =>
      ParseResult.succeed(
        DateTime.formatIsoZoned(value).slice(0, 16),
      ),
  },
) {}
```

Use it like any other field schema. The form and input work with a string, but
the mutation receives UTC:

```tsx
import { DateTime, Effect, Schema } from "effect"
import { Component, Form, MutationForm, View } from "effect-view"
import { DateTimeUtcFromZonedInput } from "./DateTimeUtcFromZonedInput"

const AppointmentSchema = Schema.Struct({
  startsAt: DateTimeUtcFromZonedInput,
})

const AppointmentView = Component.make("Appointment")(function* () {
  const [form, startsAtField] = yield* Component.useOnMount(() =>
    Effect.gen(function* () {
      const form = yield* MutationForm.service({
        schema: AppointmentSchema,
        initialEncodedValue: { startsAt: "" },
        f: ([appointment]) =>
          Effect.log(
            `Saving ${DateTime.formatIso(appointment.startsAt)}`,
          ),
      })

      return [form, Form.focusObjectOn(form, "startsAt")] as const
    }),
  )

  const startsAt = yield* Form.useInput(startsAtField)
  const [canCommit] = yield* View.useAll([form.canCommit])
  const runPromise = yield* Component.useRunPromise()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void runPromise(form.submit)
      }}
    >
      <input
        type="datetime-local"
        value={startsAt.value}
        onChange={(event) =>
          startsAt.setValue(event.currentTarget.value)
        }
      />
      <button disabled={!canCommit}>Save appointment</button>
    </form>
  )
})
```

The schema requires `DateTime.CurrentTimeZone`; provide
`DateTime.layerCurrentZoneLocal` in the application runtime. If the current
zone is `Europe/Paris`, for example, entering `2026-07-22T14:30` decodes to the
UTC instant `2026-07-22T12:30:00.000Z`.

Encoding works in the other direction. A `LensForm` whose target contains that
UTC instant presents `2026-07-22T14:30` to the local input. The component never
manually parses dates, applies offsets, or maintains a second representation;
the schema defines both directions and the form keeps them synchronized.

## Focus into subforms

The root `MutationForm` or `LensForm` represents the complete schema. UI
components usually need a smaller form representing one field, so they do not
have to receive or understand the entire root form. **Focusing** creates that
smaller form.

Every root form and every focused subform implements the same `Form.Form`
interface. There is no separate field abstraction: an individual field is
simply a `Form` focused on that part of its parent.

```tsx
const displayNameField = Form.focusObjectOn(form, "displayName")
const ageField = Form.focusObjectOn(form, "age")

const contactForm = Form.focusObjectOn(form, "contact")
const emailField = Form.focusObjectOn(contactForm, "email")
```

`displayNameField`, `ageField`, and `emailField` can each be passed to the input
component responsible for that field. Focusing can also be repeated:
`contactForm` represents the complete contact section, and `emailField`
represents its email field.

A focused form exposes only the relevant:

- `encodedValue`: the UI-facing value that can be edited.
- `value`: the decoded value as an `Option`.
- `issues`: the schema issues for that subform.

Validation and commit state remain connected to the root form. An input can
show its own issues while still observing the root form's `isValidating`,
`canCommit`, and `isCommitting` state.

Use the focusing helper that matches the value being represented:

```tsx
const property = Form.focusObjectOn(form, "contact")
const item = Form.focusArrayAt(itemsForm, 0)
const tupleMember = Form.focusTupleAt(tupleForm, 1)
const chunkItem = Form.focusChunkAt(chunkForm, 0)
```

Schema issue paths are focused at the same time. A component receiving
`emailField` gets its email issues directly instead of searching through every
issue on the root form.

## Bind a subform to an input

`Form.useInput` is the liaison between an Effect form and a React controlled
component. It reads the subform's encoded value and returns the familiar React
`{ value, setValue }` interface. Calling `setValue` updates the form, which in
turn runs the schema pipeline and updates validation state.

```tsx
const input = yield* Form.useInput(emailField, {
  debounce: "250 millis",
})

return (
  <input
    value={input.value}
    onChange={(event) => input.setValue(event.currentTarget.value)}
  />
)
```

The debounce is useful for text inputs, which can otherwise update the form and
run schema validation on every keystroke. The displayed value still updates
immediately; propagation to the form waits until the user pauses typing.

Use `Form.useOptionalInput` when the encoded field is an Effect `Option`. It
returns `value` and `setValue` together with `enabled` and `setEnabled`, making
it suitable for an optional input that the user can toggle on and off.

`useInput` and `useOptionalInput` can be used directly, but they are primarily
building blocks for your own reusable input components. A component library
can wrap them to consistently handle labels, validation issues, validating
indicators, disabled state, accessibility, styling, and a standard debounce.
Because both hooks accept a `Form.Form`, the same input components work with
subforms from both `MutationForm` and `LensForm`.

```tsx title="TextFieldFormInputView.tsx"
import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"

export declare namespace TextFieldFormInputView {
  export interface Props<
    out P extends readonly PropertyKey[],
    A,
    ER,
    EW,
  > extends Omit<TextField.RootProps, "form">,
      Form.useInput.Options {
    readonly form: Form.Form<P, A, string, ER, EW>
  }

  export type Signature = <
    P extends readonly PropertyKey[],
    A,
    ER,
    EW,
  >(
    props: Props<P, A, ER, EW>,
  ) => React.ReactNode
}

export const TextFieldFormInputView = Component.make(
  "TextFieldFormInputView",
)(function* (
  props: TextFieldFormInputView.Props<
    readonly PropertyKey[],
    any,
    any,
    any
  >,
) {
  const input = yield* Form.useInput(props.form, props)
  const [issues, isValidating, isCommitting] = yield* View.useAll([
    props.form.issues,
    props.form.isValidating,
    props.form.isCommitting,
  ])

  return (
    <Flex direction="column" gap="1">
      <TextField.Root
        value={input.value}
        onChange={(event) => input.setValue(event.target.value)}
        disabled={isCommitting}
        {...Struct.omit(props, ["form", "debounce"])}
      >
        {isValidating && (
          <TextField.Slot side="right">
            <Spinner />
          </TextField.Slot>
        )}
        {props.children}
      </TextField.Root>

      {Option.match(Array.head(issues), {
        onSome: (issue) => (
          <Callout.Root>
            <Callout.Text>{issue.message}</Callout.Text>
          </Callout.Root>
        ),
        onNone: () => null,
      })}
    </Flex>
  )
}).pipe(
  Component.withSignature<TextFieldFormInputView.Signature>(),
)
```

## The common Form model

Both root implementations and every focused subform implement `Form.Form`.
They expose the schema pipeline as reactive Lenses and Views:

| Member | Meaning |
| --- | --- |
| `encodedValue` | Writable input-shaped state. |
| `value` | The decoded value as an `Option`; `None` until decoding succeeds. |
| `issues` | Standard Schema issues scoped to this form's path. |
| `isValidating` | Whether schema decoding is currently running. |
| `canCommit` | Whether the root has a valid value and is ready to commit. |
| `isCommitting` | Whether a mutation or target write is in progress. |

The form model itself is Effect code. Effect View adds the React-facing hooks,
including `Form.useInput` and `Form.useOptionalInput`, while your own component
library remains responsible for rendering controls and layout.
