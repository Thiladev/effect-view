import { Container, Flex, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Console, Effect } from "effect"
import { Component } from "effect-fc"
import * as React from "react"
import { runtime } from "@/runtime"


class SubService extends Effect.Service<SubService>()("SubService", {
    effect: (value: string) => Effect.succeed({ value })
}) {}

const SubComponent = Component.makeUntraced("SubComponent")(function*() {
    const service = yield* SubService
    yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Console.log("SubComponent unmounted"))
        yield* Console.log("SubComponent mounted")
    }))

    return <Text>{service.value}</Text>
})

const ContextView = Component.makeUntraced("ContextView")(function*() {
    const [serviceValue, setServiceValue] = React.useState("test")
    const SubServiceLayer = React.useMemo(() => SubService.Default(serviceValue), [serviceValue])
    const SubComponentFC = yield* Effect.provide(SubComponent.use, yield* Component.useContext(SubServiceLayer))

    return (
        <Container>
            <Flex direction="column" align="center">
                <TextField.Root value={serviceValue} onChange={e => setServiceValue(e.target.value)} />
                <SubComponentFC />
            </Flex>
        </Container>
    )
}).pipe(
    Component.withRuntime(runtime.context)
)

export const Route = createFileRoute("/dev/context")({
    component: ContextView
})
