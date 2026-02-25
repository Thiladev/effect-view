import { Flex, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { GetRandomValues, makeUuid4 } from "@typed/id"
import { Effect } from "effect"
import { Async, Component, Memoized } from "effect-fc"
import * as React from "react"
import { runtime } from "@/runtime"


// Generator version
const RouteComponent = Component.makeUntraced(function* AsyncRendering() {
    const MemoizedAsyncComponentFC = yield* MemoizedAsyncComponent.use
    const AsyncComponentFC = yield* AsyncComponent.use
    const [input, setInput] = React.useState("")

    return (
        <Flex direction="column" align="stretch" gap="2">
            <TextField.Root
                value={input}
                onChange={e => setInput(e.target.value)}
            />

            <MemoizedAsyncComponentFC fallback={React.useMemo(() => <p>Loading memoized...</p>, [])} />
            <AsyncComponentFC />
        </Flex>
    )
}).pipe(
    Component.withRuntime(runtime.context)
)

// Pipeline version
// const RouteComponent = Component.make("RouteComponent")(() => Effect.Do,
//     Effect.bind("VMemoizedAsyncComponent", () => Component.useFC(MemoizedAsyncComponent)),
//     Effect.bind("VAsyncComponent", () => Component.useFC(AsyncComponent)),
//     Effect.let("input", () => React.useState("")),

//     Effect.map(({ input: [input, setInput], VAsyncComponent, VMemoizedAsyncComponent }) =>
//         <Flex direction="column" align="stretch" gap="2">
//             <TextField.Root
//                 value={input}
//                 onChange={e => setInput(e.target.value)}
//             />

//             <VMemoizedAsyncComponent />
//             <VAsyncComponent />
//         </Flex>
//     ),
// ).pipe(
//     Component.withRuntime(runtime.context)
// )


class AsyncComponent extends Component.makeUntraced("AsyncComponent")(function*() {
    const SubComponentFC = yield* SubComponent.use

    yield* Effect.sleep("500 millis") // Async operation
    // Cannot use React hooks after the async operation

    return (
        <Flex direction="column" align="stretch">
            <Text>Rendered!</Text>
            <SubComponentFC />
        </Flex>
    )
}).pipe(
    Async.async,
    Async.withOptions({ defaultFallback: <p>Loading...</p> }),
) {}
class MemoizedAsyncComponent extends Memoized.memoized(AsyncComponent) {}

class SubComponent extends Component.makeUntraced("SubComponent")(function*() {
    const [state] = React.useState(yield* Component.useOnMount(() => Effect.provide(makeUuid4, GetRandomValues.CryptoRandom)))
    return <Text>{state}</Text>
}) {}

export const Route = createFileRoute("/dev/async-rendering")({
    component: RouteComponent
})
