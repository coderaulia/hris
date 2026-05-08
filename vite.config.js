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
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return;
                    if (id.includes('exceljs')) return 'excel-vendor';
                    if (id.includes('html2canvas')) return 'pdf-html-vendor';
                    if (id.includes('canvg') || id.includes('dompurify')) return 'pdf-svg-vendor';
                    if (id.includes('fflate') || id.includes('fast-png')) return 'pdf-image-vendor';
                    if (id.includes('jspdf')) return 'pdf-vendor';
                    if (id.includes('chart.js')) return 'charts-vendor';
                    if (id.includes('sweetalert2')) return 'ui-vendor';
                    if (id.includes('@supabase')) return 'supabase-vendor';
                },
            },
        },
    },
    server: {
        port: 5173,
        open: true,
    },
});
