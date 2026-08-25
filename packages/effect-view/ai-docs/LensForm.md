# LensForm

A root form (implements `Form.Form`, see `Form.md`) that keeps an encoded draft synchronized in both directions with a target `Lens` of decoded application data. Use for settings panels, inspectors, and edit screens where a valid change should update existing state without a final submit.

```tsx
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, LensForm, View } from "effect-view"

const [form, profile] = yield* Component.useOnMount(() =>
  Effect.gen(function* () {
    const profile = Lens.fromSubscriptionRef(
      yield* SubscriptionRef.make({ displayName: "Ada", age: 37, contact: { email: "ada@example.com" } }),
    )
    const form = yield* LensForm.make({ schema: ProfileSchema, target: profile }).pipe(LensForm.thenRun)
    return [form, profile] as const
  }),
)

const [savedProfile, isCommitting] = yield* View.useAll([profile, form.isCommitting])
```

- `LensForm.make({ schema, target, initialEncodedValue? })` — `target` holds decoded data. `LensForm.thenRun` starts synchronization.
- A valid edit is decoded and written to `target` automatically; an invalid edit stays in the form (so the user can correct it) and never reaches `target`. If something else updates `target`, `LensForm` encodes that value back into the draft.
- Pass `initialEncodedValue` only when the first draft should differ from the encoded target; otherwise `LensForm.make` derives the initial draft by encoding the current target through the schema.
- No `submit` method — commits happen continuously as valid edits arrive. Focus into subforms/fields with `Form.focusObjectOn`/etc. and bind with `Form.useInput` exactly as with `MutationForm` (see `Form.md`).
