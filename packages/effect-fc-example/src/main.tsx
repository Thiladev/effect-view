import { createRouter, RouterProvider } from "@tanstack/react-router"
import { ReactRuntime } from "effect-fc"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import { runtime } from "./runtime"


const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}

// biome-ignore lint/style/noNonNullAssertion: React entrypoint
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ReactRuntime.Provider runtime={runtime}>
            <RouterProvider router={router} />
        </ReactRuntime.Provider>
    </StrictMode>
)
