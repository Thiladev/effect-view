import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { effectViewPlugin } from "@effect-view/vite-plugin"
import path from "node:path"
import { defineConfig } from "vite"


// https://vite.dev/config/
export default defineConfig({
    plugins: [
        effectViewPlugin(),
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
        }),
        react(),
    ],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
})
