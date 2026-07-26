# Effect FC

[Effect-TS](https://effect.website/) integration for React 19.2+ that allows you to write function components using Effect generators.

This library is in early development. While it is (almost) feature complete and mostly usable, expect bugs and quirks. Things are still being ironed out, so ideas and criticisms are more than welcome.

Documentation is currently being written. In the meantime, you can take a look at the `packages/example` directory.

## Peer dependencies
- `effect` 3.19+
- `react` & `@types/react` 19.2+

## Known issues
- React Refresh doesn't work for Effect FC's yet. Page reload is required to view changes. Regular React components are unaffected.

## What writing components looks like
```typescript
export class TodosView extends Component.make("TodosView")(function*() {
    const state = yield* TodosState
    const [todos] = yield* Component.useSubscribables([state.subscriptionRef])

    yield* Component.useOnMount(() => Effect.andThen(
        Console.log("Todos mounted"),
        Effect.addFinalizer(() => Console.log("Todos unmounted")),
    ))

    const Todo = yield* TodoView.use

    return (
        <Container>
            <Heading align="center">Todos</Heading>

            <Flex direction="column" align="stretch" gap="2" mt="2">
                <Todo _tag="new" />

                {Chunk.map(todos, todo =>
                    <Todo key={todo.id} _tag="edit" id={todo.id} />
                )}
            </Flex>
        </Container>
    )
}) {}

const Index = Component.make("IndexView")(function*() {
    const context = yield* Component.useLayer(TodosState.Default)
    const Todos = yield* Effect.provide(TodosView.use, context)

    return <Todos />
}).pipe(
    Component.withRuntime(runtime.context)
)

export const Route = createFileRoute("/")({
    component: Index
})
```
