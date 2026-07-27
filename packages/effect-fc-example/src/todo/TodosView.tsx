import { Container, Flex, Heading } from "@radix-ui/themes"
import { Chunk, Console, Effect } from "effect"
import { Component, Subscribable } from "effect-fc"
import { EditTodoView } from "./EditTodoView"
import { NewTodoView } from "./NewTodoView"
import { TodosState } from "./TodosState"


export class TodosView extends Component.make("TodosView")(function*() {
    const state = yield* TodosState
    const [todos] = yield* Subscribable.useAll([state.lens])

    yield* Component.useOnMount(() => Effect.andThen(
        Console.log("Todos mounted"),
        Effect.addFinalizer(() => Console.log("Todos unmounted")),
    ))

    const NewTodo = yield* NewTodoView.use
    const EditTodo = yield* EditTodoView.use

    return (
        <Container>
            <Heading align="center">Todos</Heading>

            <Flex direction="column" align="stretch" gap="2" mt="2">
                <NewTodo />

                {Chunk.map(todos, todo =>
                    <EditTodo key={todo.id} id={todo.id} />
                )}
            </Flex>
        </Container>
    )
}) {}
