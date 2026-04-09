import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
    plugins: [
        tailwindcss(),
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
            threshold: 1024,
            deleteOriginFile: false,
        }),
    ],
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: resolve(__dirname, 'index.html'),
        },
    },
    server: {
        port: 5173,
        open: true,
    },
});
