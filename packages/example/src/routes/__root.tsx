import { Container, Flex, Theme } from "@radix-ui/themes"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import "@radix-ui/themes/styles.css"
import "../index.css"


export const Route = createRootRoute({
    component: Root,
})

function Root() {
    return (
        <Theme>
            <Container mb="4">
                <Flex direction="row" justify="center" align="center" gap="2">
                    <Link to="/">Index</Link>
                    <Link to="/blank">Blank</Link>
                    <Link to="/async">Async</Link>
                    <Link to="/query">Query</Link>
                    <Link to="/form">Form</Link>
                    <Link to="/lensform">LensForm</Link>
                </Flex>
            </Container>

            <Outlet />

            <TanStackRouterDevtools />
        </Theme>
    )
}
