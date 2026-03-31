import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, Subscribable } from "effect-fc"


export declare namespace TextFieldFormInputView {
    export interface Props extends Omit<TextField.RootProps, "form">, Form.useInput.Options {
        readonly form: Form.Form<readonly PropertyKey[], any, string>
    }
}

export class TextFieldFormInputView extends Component.make("TextFieldFormInputView")(function*(
    props: TextFieldFormInputView.Props
) {
    const input = yield* Form.useInput(props.form, props)
    const [issues, isValidating, isSubmitting] = yield* Subscribable.useSubscribables([
        props.form.issues,
        props.form.isValidating,
        props.form.isSubmitting,
    ])

    return (
        <Flex direction="column" gap="1">
            <TextField.Root
                value={input.value}
                onChange={e => input.setValue(e.target.value)}
                disabled={isSubmitting}
                {...Struct.omit(props, "form")}
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
