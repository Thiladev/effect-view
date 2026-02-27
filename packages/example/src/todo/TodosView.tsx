import { Container, Flex, Heading } from "@radix-ui/themes"
import { Chunk, Console, Effect } from "effect"
import { Component, Subscribable } from "effect-fc"
import { TodosState } from "./TodosState"
import { TodoView } from "./TodoView"


export class TodosView extends Component.make("TodosView")(function*() {
    const state = yield* TodosState
    const [todos] = yield* Subscribable.useSubscribables([state.ref])

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
