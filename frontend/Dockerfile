# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all source code first
COPY . .

# Remove Electron dependencies and update for web deployment
RUN npm pkg delete dependencies.electron || true && \
    npm pkg delete devDependencies.electron || true && \
    npm pkg delete devDependencies.electron-builder || true && \
    npm pkg delete devDependencies.electron-vite || true && \
    npm pkg delete devDependencies.vite-plugin-electron || true && \
    npm pkg delete devDependencies.vite-plugin-electron-renderer || true && \
    npm pkg delete scripts.postinstall || true && \
    npm pkg set scripts.dev="vite" && \
    npm pkg set scripts.build="vite build" && \
    npm pkg set scripts.preview="vite preview"

# Install dependencies (including vite and react plugin)
RUN npm install && \
    npm install --save-dev vite @vitejs/plugin-react

# Build React app (from auto-claude-ui/src/renderer)
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
