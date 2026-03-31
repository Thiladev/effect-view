import * as Domain from "@/domain"
import { TextFieldFormInputView } from "@/lib/form/TextFieldFormInputView"
import { TextFieldOptionalFormInputView } from "@/lib/form/TextFieldOptionalFormInputView"
import { DateTimeUtcFromZonedInput } from "@/lib/schema"
import { Box, Button, Flex, IconButton } from "@radix-ui/themes"
import { GetRandomValues, makeUuid4 } from "@typed/id"
import { Chunk, type DateTime, Effect, Match, Option, Ref, Schema, Stream } from "effect"
import { Component, Form, Lens, Subscribable } from "effect-fc"
import { FaArrowDown, FaArrowUp } from "react-icons/fa"
import { FaDeleteLeft } from "react-icons/fa6"
import { TodosState } from "./TodosState"


const TodoFormSchema = Schema.compose(Schema.Struct({
    ...Domain.Todo.Todo.fields,
    completedAt: Schema.OptionFromSelf(DateTimeUtcFromZonedInput),
}), Domain.Todo.Todo)

const makeTodo = makeUuid4.pipe(
    Effect.map(id => Domain.Todo.Todo.make({
        id,
        content: "",
        completedAt: Option.none(),
    })),
    Effect.provide(GetRandomValues.CryptoRandom),
)


export type TodoProps = (
    | { readonly _tag: "new" }
    | { readonly _tag: "edit", readonly id: string }
)

export class TodoView extends Component.make("TodoView")(function*(props: TodoProps) {
    const state = yield* TodosState

    const [
        indexRef,
        form,
        contentField,
        completedAtField,
    ] = yield* Component.useOnChange(() => Effect.gen(function*() {
        const indexRef = Match.value(props).pipe(
            Match.tag("new", () => Subscribable.make({ get: Effect.succeed(-1), changes: Stream.make(-1) })),
            Match.tag("edit", ({ id }) => state.getIndexSubscribable(id)),
            Match.exhaustive,
        )

        const form = yield* Form.service({
            schema: TodoFormSchema,
            initialEncodedValue: yield* Schema.encode(TodoFormSchema)(
                yield* Match.value(props).pipe(
                    Match.tag("new", () => makeTodo),
                    Match.tag("edit", ({ id }) => state.getElementRef(id)),
                    Match.exhaustive,
                )
            ),
            f: ([todo, form]) => Match.value(props).pipe(
                Match.tag("new", () => Ref.update(state.ref, Chunk.prepend(todo)).pipe(
                    Effect.andThen(makeTodo),
                    Effect.andThen(Schema.encode(TodoFormSchema)),
                    Effect.andThen(v => Lens.set(form.encodedValue, v)),
                )),
                Match.tag("edit", ({ id }) => Ref.set(state.getElementRef(id), todo)),
                Match.exhaustive,
            ),
            autosubmit: props._tag === "edit",
        })

        return [
            indexRef,
            form,
            Form.focusObjectField(form, "content"),
            Form.focusObjectField(form, "completedAt"),
        ] as const
    }), [props._tag, props._tag === "edit" ? props.id : undefined])

    const [index, size, canSubmit] = yield* Subscribable.useSubscribables([
        indexRef,
        state.sizeSubscribable,
        form.canSubmit,
    ])

    const runSync = yield* Component.useRunSync()
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

                        {props._tag === "new" &&
                            <Button disabled={!canSubmit} onClick={() => void runPromise(form.submit)}>
                                Add
                            </Button>
                        }
                    </Flex>
                </Flex>
            </Box>

            {props._tag === "edit" &&
                <Flex direction="column" justify="center" align="center" gap="1">
                    <IconButton
                        disabled={index <= 0}
                        onClick={() => runSync(state.moveLeft(props.id))}
                    >
                        <FaArrowUp />
                    </IconButton>

                    <IconButton
                        disabled={index >= size - 1}
                        onClick={() => runSync(state.moveRight(props.id))}
                    >
                        <FaArrowDown />
                    </IconButton>

                    <IconButton onClick={() => runSync(state.remove(props.id))}>
                        <FaDeleteLeft />
                    </IconButton>
                </Flex>
            }
        </Flex>
    )
}) {}
