import { Button, Container, Flex, Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Console, Effect, Match, Option, ParseResult, Schema } from "effect"
import { Component, Form, Subscribable } from "effect-fc"
import { TextFieldFormInput } from "@/lib/form/TextFieldFormInput"
import { DateTimeUtcFromZonedInput } from "@/lib/schema"
import { runtime } from "@/runtime"


const email = Schema.pattern<typeof Schema.String>(
    /^(?!\.)(?!.*\.\.)([A-Z0-9_+-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i,

    {
        identifier: "email",
        title: "email",
        message: () => "Not an email address",
    },
)

const RegisterFormSchema = Schema.Struct({
    email: Schema.String.pipe(email),
    password: Schema.String.pipe(Schema.minLength(3)),
    birth: Schema.OptionFromSelf(DateTimeUtcFromZonedInput),
})

const RegisterFormSubmitSchema = Schema.Struct({
    email: Schema.transformOrFail(
        Schema.String,
        Schema.String,
        {
            decode: (input, _options, ast) => input !== "admin@admin.com"
                ? ParseResult.succeed(input)
                : ParseResult.fail(new ParseResult.Type(ast, input, "This email is already in use.")),
            encode: ParseResult.succeed,
        },
    ),
    password: Schema.String,
    birth: Schema.OptionFromSelf(Schema.DateTimeUtcFromSelf),
})

class RegisterForm extends Effect.Service<RegisterForm>()("RegisterForm", {
    scoped: Form.service({
        schema: RegisterFormSchema.pipe(
            Schema.compose(
                Schema.transformOrFail(
                    Schema.typeSchema(RegisterFormSchema),
                    Schema.typeSchema(RegisterFormSchema),
                    {
                        decode: v => Effect.andThen(Effect.sleep("500 millis"), ParseResult.succeed(v)),
                        encode: ParseResult.succeed,
                    },
                ),
            ),
        ),

        initialEncodedValue: { email: "", password: "", birth: Option.none() },
        f: Effect.fnUntraced(function*([value]) {
            yield* Effect.sleep("500 millis")
            return yield* Schema.decode(RegisterFormSubmitSchema)(value)
        }),
        debounce: "500 millis",
    })
}) {}

class RegisterFormView extends Component.makeUntraced("RegisterFormView")(function*() {
    const form = yield* RegisterForm
    const [canSubmit, submitResult] = yield* Subscribable.useSubscribables([
        form.canSubmit,
        form.mutation.result,
    ])

    const runPromise = yield* Component.useRunPromise()
    const TextFieldFormInputFC = yield* TextFieldFormInput.use

    yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Console.log("RegisterFormView unmounted"))
        yield* Console.log("RegisterFormView mounted")
    }))


    return (
        <Container width="300">
            <form onSubmit={e => {
                e.preventDefault()
                void runPromise(form.submit)
            }}>
                <Flex direction="column" gap="2">
                    <TextFieldFormInputFC
                        field={yield* form.field(["email"])}
                    />

                    <TextFieldFormInputFC
                        field={yield* form.field(["password"])}
                    />

                    <TextFieldFormInputFC
                        optional
                        type="datetime-local"
                        field={yield* form.field(["birth"])}
                        defaultValue=""
                    />

                    <Button disabled={!canSubmit}>Submit</Button>
                </Flex>
            </form>

            {Match.value(submitResult).pipe(
                Match.tag("Initial", () => <></>),
                Match.tag("Running", () => <Text>Submitting...</Text>),
                Match.tag("Success", () => <Text>Submitted successfully!</Text>),
                Match.tag("Failure", e => <Text>Error: {e.cause.toString()}</Text>),
                Match.exhaustive,
            )}
        </Container>
    )
}) {}

const RegisterPage = Component.makeUntraced("RegisterPage")(function*() {
    const RegisterFormViewFC = yield* Effect.provide(
        RegisterFormView.use,
        yield* Component.useContext(RegisterForm.Default),
    )

    return <RegisterFormViewFC />
}).pipe(
    Component.withRuntime(runtime.context)
)


export const Route = createFileRoute("/form")({
    component: RegisterPage
})
