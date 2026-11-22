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

## Create forms once

`MutationForm.make` and `LensForm.make` construct forms. Pipe them through the
module's `run` operator to start validation or synchronization in the current
scope. Create each root form once and keep it stable.

## MutationForm: validate, then submit

Use `MutationForm` for registration, checkout, search, and other workflows with
an explicit submit action. It owns the encoded draft, continuously decodes it
with the schema, and exposes the last valid decoded value. Calling `submit`
runs the mutation only when the form can commit.

```tsx
import { Effect } from "effect"
import { Component, Form, MutationForm } from "effect-view"

const CreateProfileView = Component.make("CreateProfile")(function* () {
  const form = yield* Component.useOnMount(() =>
    MutationForm.make({
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
    }).pipe(MutationForm.thenRun),
  )

  const { isCommitting } = yield* Form.useStatus(form)
  const runPromise = yield* Component.useRunPromise()

  // Focused inputs are added in "Focus into subforms" below.
  return (
    <button
      disabled={isCommitting}
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

`MutationForm.thenRun` starts initial validation. In the example above,
`Component.useOnMount` keeps that validation and the form's mutation work tied
to the component that owns them.

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

      const form = yield* LensForm.make({
        schema: ProfileSchema,
        target: profile,
      }).pipe(LensForm.thenRun)

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
encoded target. Otherwise `LensForm.make` obtains the initial draft by encoding
the target through the schema.

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

Form focus helpers also have a dual API. Pass only the key or index to get a curried function. Curried helpers can be chained
with `pipe` to focus through a deeper path:

```tsx
const emailField = form.pipe(
  Form.focusObjectOn("contact"),
  Form.focusObjectOn("email"),
)
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
including `Form.useLiveInput`, `Form.useOptionalLiveInput`, `Form.useBufferedInput`,
`Form.useOptionalBufferedInput`, and `Form.useStatus`, while your own component
library remains responsible for rendering controls and layout.

## Bind a subform to an input

An input hook is the liaison between an Effect form and a React controlled
component. It reads the subform's encoded value and returns the familiar React
`{ value, setValue }` interface, and decides **when** the value is written to the
form, which is what runs the schema pipeline and updates validation state.

There are two variants, which differ only in that moment. Pick the one that fits
the field and the kind of form it belongs to:

| | Live inputs | Buffered inputs |
| --- | --- | --- |
| Hooks | `useLiveInput`, `useOptionalLiveInput` | `useBufferedInput`, `useOptionalBufferedInput` |
| Writes to the form | on every `setValue` (optionally debounced) | when `flush()` is called, and on submit |
| Validation runs | while the user is typing | once the user is done editing |
| Typical form | `LensForm` | `MutationForm` |

Both variants return `{ value, setValue, flush, flushed }`. Call `flush` when
the user is done with the input, for example in `onBlur`. `flushed` becomes
`true` once the input has been flushed, either by `flush` or by
`MutationForm.submit`.

Each variant has an optional counterpart for a field whose encoded value is an
Effect `Option`. It returns `enabled` and `setEnabled` in addition, making it
suitable for an optional input that the user can toggle on and off. `value` and
`setValue` operate on the unwrapped value, and the required `defaultValue` is
used as `value` while the field is disabled.

### Live inputs

`Form.useLiveInput` writes to the form each time `setValue` is called, so the
schema runs, and issues update, as the user types.

```tsx
const input = yield* Form.useLiveInput(emailField, {
  debounce: "250 millis",
})

return (
  <input
    value={input.value}
    onChange={(event) => input.setValue(event.currentTarget.value)}
  />
)
```

Use it when the form should follow the input continuously:

- **`LensForm` fields.** There is no submit step, so the target stays
  synchronized with every valid edit.
- **Live feedback.** Search boxes, filters, and previews that react to each
  change.
- **Controls that change in one gesture.** Checkboxes, selects, switches, and
  sliders, where there is no "mid-edit" state to protect.

The `debounce` option is useful for text inputs, which would otherwise validate
on every keystroke. The displayed value still updates immediately; propagation to
the form waits until the user pauses typing. A value still waiting for its
debounce when `MutationForm.submit` runs is written first, so pressing Enter
right after typing submits what the user typed.

Call `flush()` when the user is done with the input, for example in `onBlur`. It
writes the value right away instead of waiting for the debounce.

`Form.useOptionalLiveInput(form, { defaultValue, debounce? })` is the
optional counterpart.

### Buffered inputs

`Form.useBufferedInput` keeps the value locally while the user types and writes it to
the form only when the returned `flush()` is called. The form is not validated
mid-edit, so an incomplete value does not show an error before the user has
finished entering it.

```tsx
const input = yield* Form.useBufferedInput(emailField)

return (
  <input
    value={input.value}
    onChange={(event) => input.setValue(event.currentTarget.value)}
    onBlur={input.flush}
  />
)
```

Use it when validating while typing would get in the way:

- **`MutationForm` fields.** The value is only needed when the form is
  submitted, so there is no reason to validate each keystroke.
- **Text fields with format rules.** An email address or a password is invalid
  until the user has typed enough of it, and an error shown after the first
  character is noise.
- **Expensive or asynchronous validation.** A schema that calls a server, for
  example to check that a username is free, runs once per field instead of once
  per keystroke.

`Form.useOptionalBufferedInput(form, { defaultValue })` is the optional counterpart.
Toggling `enabled` writes right away, since a toggle is a completed action
rather than something being typed.

A few details are worth knowing:

- `flush` means "the user is done editing this input". It is not tied to the DOM,
  so call it from whatever your renderer offers; in a DOM input, that is
  `onBlur`. It returns a `Promise` that resolves once the value has been written
  to the form and validated.
- There is no `debounce` option: nothing is written while typing, so there is
  nothing to debounce.
- A value that has not been written yet is also written when
  `MutationForm.submit` runs. Pressing Enter in a field without leaving it
  therefore submits what the user typed, not the previous value.
- A `LensForm` has no submit step, so a buffered input only reaches the target when
  `flush` is called. Prefer live inputs there, or make sure `flush` is wired.
- An input that unmounts before it is flushed or submitted drops its pending
  value.

### Display the form status

Use `Form.useStatus` for displayed form status. It debounces short-lived state
changes, avoiding flicker in pending indicators.

```tsx
const { isValidating, isCommitting, canCommit } = yield* Form.useStatus(form)
```

### Build reusable input components

The input hooks can be used directly, but they are primarily building blocks for
your own reusable input components. A component library can wrap them to
consistently handle labels, validation issues, validating indicators, disabled
state, accessibility, styling, and a standard debounce. Because they accept a
`Form.Form`, the same input components work with subforms from both
`MutationForm` and `LensForm`.

A library typically provides one wrapper per variant. This one wraps
`useLiveInput`; the buffered wrapper is identical except that it calls
`Form.useBufferedInput(props.form)` and drops the `debounce` option.

```tsx title="TextFieldFormLiveInputView.tsx"
import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"

export declare namespace TextFieldFormLiveInputView {
  export interface Props<
    out P extends readonly PropertyKey[],
    A,
    ER,
    EW,
  > extends Omit<TextField.RootProps, "form">,
      Form.useLiveInput.Options {
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

export const TextFieldFormLiveInputView = Component.make(
  "TextFieldFormLiveInputView",
)(function* (
  props: TextFieldFormLiveInputView.Props<
    readonly PropertyKey[],
    any,
    any,
    any
  >,
) {
  const input = yield* Form.useLiveInput(props.form, props)
  const [issues] = yield* View.useAll([props.form.issues])
  const { isValidating, isCommitting } = yield* Form.useStatus(props.form)

  return (
    <Flex direction="column" gap="1">
      <TextField.Root
        value={input.value}
        onChange={(event) => input.setValue(event.target.value)}
        onBlur={input.flush}
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

      {input.flushed && Option.match(Array.head(issues), {
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
  Component.withSignature<TextFieldFormLiveInputView.Signature>(),
)
```

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
import { Component, Form, MutationForm } from "effect-view"
import { DateTimeUtcFromZonedInput } from "./DateTimeUtcFromZonedInput"

const AppointmentSchema = Schema.Struct({
  startsAt: DateTimeUtcFromZonedInput,
})

const AppointmentView = Component.make("Appointment")(function* () {
  const [form, startsAtField] = yield* Component.useOnMount(() =>
    Effect.gen(function* () {
      const form = yield* MutationForm.make({
        schema: AppointmentSchema,
        initialEncodedValue: { startsAt: "" },
        f: ([appointment]) =>
          Effect.log(
            `Saving ${DateTime.formatIso(appointment.startsAt)}`,
          ),
      }).pipe(MutationForm.thenRun)

      return [form, Form.focusObjectOn(form, "startsAt")] as const
    }),
  )

  const startsAt = yield* Form.useLiveInput(startsAtField)
  const { isCommitting } = yield* Form.useStatus(form)
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
      <button disabled={isCommitting}>Save appointment</button>
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
