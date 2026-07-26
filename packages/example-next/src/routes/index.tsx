import { Button, Container, Flex, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, SubscriptionRef } from "effect"
import { Component, Lens, View } from "effect-fc-next"
import { runtime } from "@/runtime"


const TodoRouteComponent = Component.make("TodoRouteView")(function*() {
    const todosLens = yield* Component.useOnMount(() => Effect.map(
        SubscriptionRef.make<readonly string[]>([]),
        Lens.fromSubscriptionRef,
    ))
    const draftLens = yield* Component.useOnMount(() => Effect.map(
        SubscriptionRef.make(""),
        Lens.fromSubscriptionRef,
    ))

    const [todos] = yield* View.useAll([todosLens])
    const [draft, setDraft] = yield* Lens.useState(draftLens)
    const runPromise = yield* Component.useRunPromise()

    const addTodo = Lens.update(todosLens, todos =>
        draft.trim() === ""
            ? todos
            : [...todos, draft.trim()],
    ).pipe(
        Effect.andThen(Lens.set(draftLens, "")),
    )

    return (
        <Container width="480">
            <Flex direction="column" gap="3">
                <Text size="2">A small Effect v4 todo state example backed by a Lens.</Text>

                <Flex gap="2">
                    <TextField.Root
                        value={draft}
                        onChange={event => setDraft(event.currentTarget.value)}
                    />

                    <Button onClick={() => void runPromise(addTodo)}>
                        Add
                    </Button>
                </Flex>

                {todos.map(todo => <Text key={todo}>• {todo}</Text>)}
            </Flex>
        </Container>
    )
}).pipe(
    Component.withContext(runtime.context),
)

export const Route = createFileRoute("/")({
    component: TodoRouteComponent,
})
