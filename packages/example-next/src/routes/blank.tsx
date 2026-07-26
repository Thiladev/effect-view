import { createFileRoute } from "@tanstack/react-router"


export const Route = createFileRoute("/blank")({
    component: RouteComponent
})

function RouteComponent() {
    return <div>Hello "/blank"!</div>
}
