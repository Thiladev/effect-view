import { Container, Flex, Heading } from "@radix-ui/themes"
import { Chunk, Console, Effect } from "effect"
import { Component, Subscribable } from "effect-fc"
import { Todo } from "./Todo"
import { TodosState } from "./TodosState.service"


export class Todos extends Component.makeUntraced("Todos")(function*() {
    const state = yield* TodosState
    const [todos] = yield* Subscribable.useSubscribables([state.ref])

    yield* Component.useOnMount(() => Effect.andThen(
        Console.log("Todos mounted"),
        Effect.addFinalizer(() => Console.log("Todos unmounted")),
    ))

    const TodoFC = yield* Todo.use

    return (
        <Container>
            <Heading align="center">Todos</Heading>

            <Flex direction="column" align="stretch" gap="2" mt="2">
                <TodoFC _tag="new" />

                {Chunk.map(todos, todo =>
                    <TodoFC key={todo.id} _tag="edit" id={todo.id} />
                )}
            </Flex>
        </Container>
    )
}) {}
