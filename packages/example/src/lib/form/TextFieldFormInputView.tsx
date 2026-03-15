import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option } from "effect"
import { Component, Form, Subscribable } from "effect-fc"


export declare namespace TextFieldFormInputView {
    export interface Props
    extends TextField.RootProps, Form.useInput.Options {
        readonly field: Form.FormField<any, string>
    }
}


export class TextFieldFormInputView extends Component.make("TextFieldFormInputView")(function*(
    props: TextFieldFormInputView.Props
) {
    const input = yield* Form.useInput(props.field, props)
    const [issues, isValidating, isSubmitting] = yield* Subscribable.useSubscribables([
        props.field.issues,
        props.field.isValidating,
        props.field.isSubmitting,
    ])

    return (
        <Flex direction="column" gap="1">
            <TextField.Root
                value={input.value}
                onChange={e => input.setValue(e.target.value)}
                disabled={isSubmitting}
                {...props}
            >
                {isValidating &&
                    <TextField.Slot side="right">
                        <Spinner />
                    </TextField.Slot>
                }

                {props.children}
            </TextField.Root>

            {Option.match(Array.head(issues), {
                onSome: issue => (
                    <Callout.Root>
                        <Callout.Text>{issue.message}</Callout.Text>
                    </Callout.Root>
                ),

                onNone: () => <></>,
            })}
        </Flex>
    )
}) {}
