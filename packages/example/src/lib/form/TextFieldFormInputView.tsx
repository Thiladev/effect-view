import { Callout, Flex, Spinner, Switch, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, Subscribable } from "effect-fc"


interface Props
extends TextField.RootProps, Form.useInput.Options {
    readonly optional?: false
    readonly field: Form.FormField<any, string>
}

interface OptionalProps
extends Omit<TextField.RootProps, "optional" | "defaultValue">, Form.useOptionalInput.Options<string> {
    readonly optional: true
    readonly field: Form.FormField<any, Option.Option<string>>
}

export type TextFieldFormInputProps = Props | OptionalProps


export class TextFieldFormInputView extends Component.make("TextFieldFormInput")(function*(props: TextFieldFormInputProps) {
    const input: (
        | { readonly optional: true } & Form.useOptionalInput.Success<string>
        | { readonly optional: false } & Form.useInput.Success<string>
    ) = props.optional
        // biome-ignore lint/correctness/useHookAtTopLevel: "optional" reactivity not supported
        ? { optional: true, ...yield* Form.useOptionalInput(props.field, props) }
        // biome-ignore lint/correctness/useHookAtTopLevel: "optional" reactivity not supported
        : { optional: false, ...yield* Form.useInput(props.field, props) }

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
                disabled={(input.optional && !input.enabled) || isSubmitting}
                {...Struct.omit(props, "optional", "defaultValue")}
            >
                {input.optional &&
                    <TextField.Slot side="left">
                        <Switch
                            size="1"
                            checked={input.enabled}
                            onCheckedChange={input.setEnabled}
                        />
                    </TextField.Slot>
                }

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
