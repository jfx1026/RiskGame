import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyDirBeforeBuild: true,
        minify: 'esbuild',
        sourcemap: false,
        rollupOptions: {
            input: 'index.html',
        },
    },
    server: {
        open: true,
    },
    test: {
        globals: true,
        environment: 'node',
    },
});
