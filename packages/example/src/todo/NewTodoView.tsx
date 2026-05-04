import { Box, Button, Flex } from "@radix-ui/themes"
import { GetRandomValues, makeUuid4 } from "@typed/id"
import { Chunk, type DateTime, Effect, Option, Schema } from "effect"
import { Component, Form, Lens, SubmittableForm, Subscribable } from "effect-fc"
import * as Domain from "@/domain"
import { TextFieldFormInputView } from "@/lib/form/TextFieldFormInputView"
import { TextFieldOptionalFormInputView } from "@/lib/form/TextFieldOptionalFormInputView"
import { TodoFormSchema } from "./TodoFormSchema"
import { TodosState } from "./TodosState"


const makeTodo = makeUuid4.pipe(
    Effect.map(id => Domain.Todo.Todo.make({
        id,
        content: "",
        completedAt: Option.none(),
    })),
    Effect.provide(GetRandomValues.CryptoRandom),
)


export class NewTodoView extends Component.make("NewTodoView")(function*() {
    const state = yield* TodosState

    const [
        form,
        contentField,
        completedAtField,
    ] = yield* Component.useOnMount(() => Effect.gen(function*() {
        const form = yield* SubmittableForm.service({
            schema: TodoFormSchema,
            initialEncodedValue: yield* Schema.encode(TodoFormSchema)(yield* makeTodo),
            f: ([todo, form]) => Lens.update(state.lens, Chunk.prepend(todo)).pipe(
                Effect.andThen(makeTodo),
                Effect.andThen(Schema.encode(TodoFormSchema)),
                Effect.andThen(v => Lens.set(form.encodedValue, v)),
            ),
        })

        return [
            form,
            Form.focusObjectOn(form, "content"),
            Form.focusObjectOn(form, "completedAt"),
        ] as const
    }))

    const [canCommit] = yield* Subscribable.useAll([form.canCommit])

    const runPromise = yield* Component.useRunPromise<DateTime.CurrentTimeZone>()
    const TextFieldFormInput = yield* TextFieldFormInputView.use
    const TextFieldOptionalFormInput = yield* TextFieldOptionalFormInputView.use


    return (
        <Flex direction="row" align="center" gap="2">
            <Box flexGrow="1">
                <Flex direction="column" align="stretch" gap="2">
                    <TextFieldFormInput
                        form={contentField}
                        debounce="250 millis"
                    />

                    <Flex direction="row" justify="center" align="center" gap="2">
                        <TextFieldOptionalFormInput
                            form={completedAtField}
                            type="datetime-local"
                            defaultValue=""
                        />

                        <Button disabled={!canCommit} onClick={() => void runPromise(form.submit)}>
                            Add
                        </Button>
                    </Flex>
                </Flex>
            </Box>
        </Flex>
    )
}) {}
