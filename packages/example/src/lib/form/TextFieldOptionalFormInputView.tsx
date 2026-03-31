import { Callout, Flex, Spinner, Switch, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, Subscribable } from "effect-fc"


export declare namespace TextFieldOptionalFormInputView {
    export interface Props extends Omit<TextField.RootProps, "form" | "defaultValue">, Form.useOptionalInput.Options<string> {
        readonly form: Form.Form<readonly PropertyKey[], any, Option.Option<string>>
    }
}

export class TextFieldOptionalFormInputView extends Component.make("TextFieldOptionalFormInputView")(function*(
    props: TextFieldOptionalFormInputView.Props
) {
    const input = yield* Form.useOptionalInput(props.form, props)
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
                disabled={!input.enabled || isSubmitting}
                {...Struct.omit(props, "form", "defaultValue")}
            >
                <TextField.Slot side="left">
                    <Switch
                        size="1"
                        checked={input.enabled}
                        onCheckedChange={input.setEnabled}
                    />
                </TextField.Slot>

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
