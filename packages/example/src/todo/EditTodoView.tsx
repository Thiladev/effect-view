import { Box, Flex, IconButton } from "@radix-ui/themes"
import { Effect } from "effect"
import { Component, Form, Subscribable, SynchronizedForm } from "effect-fc"
import { FaArrowDown, FaArrowUp } from "react-icons/fa"
import { FaDeleteLeft } from "react-icons/fa6"
import { TextFieldFormInputView } from "@/lib/form/TextFieldFormInputView"
import { TextFieldOptionalFormInputView } from "@/lib/form/TextFieldOptionalFormInputView"
import { TodoFormSchema } from "./TodoFormSchema"
import { TodosState } from "./TodosState"


export interface EditTodoViewProps {
    readonly id: string
}

export class EditTodoView extends Component.make("TodoView")(function*(props: EditTodoViewProps) {
    const state = yield* TodosState

    const [
        indexSubscribable,
        contentField,
        completedAtField,
    ] = yield* Component.useOnChange(() => Effect.gen(function*() {
        const indexSubscribable = state.getIndexSubscribable(props.id)

        const form = yield* SynchronizedForm.service({
            schema: TodoFormSchema,
            target: state.getElementLens(props.id),
        })

        return [
            indexSubscribable,
            Form.focusObjectOn(form, "content"),
            Form.focusObjectOn(form, "completedAt"),
        ] as const
    }), [props.id])

    const [index, size] = yield* Subscribable.useAll([
        indexSubscribable,
        state.sizeSubscribable,
    ])

    const runSync = yield* Component.useRunSync()
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
                    </Flex>
                </Flex>
            </Box>

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
        </Flex>
    )
}) {}
