import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is published as a GitHub project page, so assets live under
// /<repo>/. Override with VITE_BASE when hosting elsewhere.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/phylo-studio/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
