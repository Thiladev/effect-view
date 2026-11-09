import { Container, Flex, Text } from "@radix-ui/themes"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { ReactRuntime } from "effect-view"
import { userRuntime } from "@/user"


// The router renders the routes below, so they can't be wrapped in Effect View components. Providing `userRuntime`
// here makes its services available to the ones that read `userRuntime.context`.
function UserLayout() {
    return (
        <ReactRuntime.Provider runtime={userRuntime} fallback={<Text>Loading user...</Text>}>
            <Container width="480">
                <Flex direction="column" gap="3">
                    <Flex gap="2">
                        <Link to="/user">Profile</Link>
                        <Link to="/user/edit">Edit</Link>
                    </Flex>

                    <Outlet />
                </Flex>
            </Container>
        </ReactRuntime.Provider>
    )
}

export const Route = createFileRoute("/user")({
    component: UserLayout,
})
