import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For a project site, change this to '/YOUR-REPOSITORY-NAME/'.
// For username.github.io or a custom domain, use '/'.
export default defineConfig({
  plugins: [react()],
base: '/weekwise/',})
