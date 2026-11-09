import { Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Component, Lens } from "effect-view"
import { CurrentUser, userRuntime } from "@/user"


const EditUserView = Component.make("EditUserView")(function*() {
    const user = yield* CurrentUser
    const [name, setName] = yield* Lens.useState(user.name)

    return <>
        <Text>The name is shared with the profile route, and is kept until you leave /user.</Text>

        <TextField.Root
            value={name}
            onChange={event => setName(event.currentTarget.value)}
        />
    </>
}).pipe(
    Component.withContext(userRuntime.context),
)

export const Route = createFileRoute("/user/edit")({
    component: EditUserView,
})
