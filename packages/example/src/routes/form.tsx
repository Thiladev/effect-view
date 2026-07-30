import { Button, Container, Flex, Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Console, Effect, Schema } from "effect"
import { Component, Form, MutationForm, View } from "effect-view"
import { TextFieldFormInputView } from "@/lib/form/TextFieldFormInputView"
import { runtime } from "@/runtime"


const RegisterSchema = Schema.Struct({
    email: Schema.String.check(
        Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
            message: "Enter a valid email address",
        }),
    ),
    password: Schema.String.check(
        Schema.isMinLength(5, {
            message: "Password must be at least 5 characters long",
        }),
    ),
})

const RegisterRouteComponent = Component.make("RegisterRouteView")(function*() {
    yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Console.log("Form route unmounted"))
        yield* Console.log("Form route mounted")
    }))

    const [form, emailField, passwordField] = yield* Component.useOnMount(() => Effect.gen(function*() {
        const form = yield* MutationForm.make({
            schema: RegisterSchema,
            initialEncodedValue: { email: "", password: "" },
            f: ([value]) => Effect.log(`Registered ${value.email}`),
        }).pipe(
            MutationForm.thenRun,
        )

        const emailField = Form.focusObjectOn(form, "email")
        const passwordField = Form.focusObjectOn(form, "password")

        return [form, emailField, passwordField] as const
    }))

    const [canCommit, isCommitting] = yield* View.useAll([
        form.canCommit,
        form.isCommitting,
    ])

    const TextFieldFormInput = yield* TextFieldFormInputView.use
    const runPromise = yield* Component.useRunPromise()


    return (
        <Container width="300">
            <form onSubmit={event => {
                event.preventDefault()
                void runPromise(form.submit)
            }}>
                <Flex direction="column" gap="2">
                    <TextFieldFormInput
                        form={emailField}
                        placeholder="Email"
                        debounce="250 millis"
                    />
                    <TextFieldFormInput
                        form={passwordField}
                        placeholder="Password"
                        type="password"
                        debounce="250 millis"
                    />
                    <Button disabled={!canCommit || isCommitting}>
                        {isCommitting ? "Submitting…" : "Submit"}
                    </Button>
                </Flex>
            </form>
            <Text size="2">A MutationForm validates local input, then submits it.</Text>
        </Container>
    )
}).pipe(
    Component.withContext(runtime.context),
)

export const Route = createFileRoute("/form")({
    component: RegisterRouteComponent,
})
