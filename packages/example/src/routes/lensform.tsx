import { Container, Flex } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Console, Context, Effect, Layer, Schema, Stream, SubscriptionRef } from "effect"
import { Component, Form, Lens, LensForm } from "effect-view"
import { TextFieldFormInputView } from "@/lib/form/TextFieldFormInputView"
import { runtime } from "@/runtime"


const UserProfileSchema = Schema.Struct({
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

const AppStateSchema = Schema.Struct({
    currentUser: UserProfileSchema,
})

class AppState extends Context.Service<AppState, {
    readonly lens: Lens.Lens<typeof AppStateSchema.Type>
}>()("AppState") {
    static readonly layer = Layer.effect(AppState, Effect.gen(function*() {
        return {
            lens: Lens.fromSubscriptionRef(
                yield* SubscriptionRef.make<typeof AppStateSchema.Type>({
                    currentUser: {
                        email: "",
                        password: "",
                    },
                })
            ),
        }
    }))
}


const LensFormPageView = Component.make("LensFormPageView")(function*() {
    yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Console.log("LensForm route unmounted"))
        yield* Console.log("LensForm route mounted")
    }))

    const context = yield* Component.useLayer(AppState.layer)
    const UserProfileEditor = yield* Effect.provide(UserProfileEditorView.use, context)

    return <UserProfileEditor />
})


const UserProfileEditorView = Component.make("UserProfileEditorView")(function*() {
    const appState = yield* AppState

    const [
        emailField,
        passwordField,
    ] = yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.forkScoped(
            Stream.runForEach(Lens.changes(appState.lens), Console.log)
        )

        const form = yield* LensForm.service({
            schema: UserProfileSchema,
            target: Lens.focusObjectOn(appState.lens, "currentUser"),
            initialEncodedValue: {
                email: "",
                password: "",
            },
        })

        const emailField = Form.focusObjectOn(form, "email")
        const passwordField = Form.focusObjectOn(form, "password")

        return [emailField, passwordField] as const
    }))

    const TextFieldFormInput = yield* TextFieldFormInputView.use


    return (
        <Container width="300">
            <form onSubmit={event => {
                event.preventDefault()
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
                </Flex>
            </form>
        </Container>
    )
})


export const Route = createFileRoute("/lensform")({
    component: Component.withContext(LensFormPageView, runtime.context),
})
