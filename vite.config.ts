import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {vitePreprocess} from "@sveltejs/vite-plugin-svelte";
import adapter from "@sveltejs/adapter-node";
import path from "path";

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit({
        preprocess: vitePreprocess(),
        adapter: adapter(),
        outDir: path.join(process.cwd(), '.svelte-kit'),
        exclude: [path.join(process.cwd(), "src", "api"), path.join(process.cwd(), "src", "libs"), path.join(process.cwd(), "src", "assets")],

        files: {
            appTemplate: path.join(process.cwd(), "src", "client", "src", 'app.html'),
            assets: path.join(process.cwd(), "src", "client", 'static'),
            src: path.join(process.cwd(), "src", "client", 'src'),
        }
    })],

    server: {
        proxy: {'/api': 'http://localhost:3000'}
    },
});