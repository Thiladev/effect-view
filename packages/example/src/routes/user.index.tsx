import { Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Component, View } from "effect-view"
import { CurrentUser, userRuntime } from "@/user"


const UserProfileView = Component.make("UserProfileView")(function*() {
    const user = yield* CurrentUser
    const [name] = yield* View.useAll([user.name])

    return <Text>Hello, {name}!</Text>
}).pipe(
    Component.withContext(userRuntime.context),
)

export const Route = createFileRoute("/user/")({
    component: UserProfileView,
})
