import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { Component } from "effect-fc"
import { runtime } from "@/runtime"
import { TodosState } from "@/todo/TodosState"
import { TodosView } from "@/todo/TodosView"


const TodosStateLive = TodosState.Default("todos")

const Index = Component.make("IndexView")(function*() {
    const Todos = yield* Effect.provide(
        TodosView.use,
        yield* Component.useLayer(TodosStateLive),
    )

    return <Todos />
}).pipe(
    Component.withRuntime(runtime.context)
)

export const Route = createFileRoute("/")({
    component: Index
})
