#!/bin/bash
set -e

echo "🐳 Auto-Claude Docker Conversion Script"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AUTO_CLAUDE_REPO="https://github.com/AndyMik90/Auto-Claude.git"
AUTO_CLAUDE_VERSION="v2.7.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="${SCRIPT_DIR}/temp"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found. Please install Git.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker Desktop.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found. Please install docker-compose.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git installed${NC}"
echo -e "${GREEN}✓ Docker installed${NC}"
echo -e "${GREEN}✓ docker-compose installed${NC}"

# Clone Auto-Claude repository
echo ""
echo "📦 Fetching Auto-Claude source code..."

# Clean up temp directory if it exists
if [ -d "$TEMP_DIR" ]; then
    echo "Cleaning up previous temp directory..."
    rm -rf "$TEMP_DIR"
fi

mkdir -p "$TEMP_DIR"

echo -e "${BLUE}Cloning Auto-Claude repository (${AUTO_CLAUDE_VERSION})...${NC}"
git clone --depth 1 --branch "$AUTO_CLAUDE_VERSION" "$AUTO_CLAUDE_REPO" "$TEMP_DIR/Auto-Claude"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to clone Auto-Claude repository${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Repository cloned successfully${NC}"

# Prepare backend directory
echo ""
echo "🏗️  Setting up backend directory..."

# Create backend structure
mkdir -p "$BACKEND_DIR/auto-claude"
mkdir -p "$BACKEND_DIR/api"

# Copy Python backend from cloned repo
echo "Copying Python backend code..."
if [ -d "$TEMP_DIR/Auto-Claude/auto-claude" ]; then
    cp -r "$TEMP_DIR/Auto-Claude/auto-claude"/* "$BACKEND_DIR/auto-claude/"
    echo -e "${GREEN}✓ Python backend copied${NC}"
else
    echo -e "${RED}❌ auto-claude directory not found in repository${NC}"
    exit 1
fi

# Verify main.py exists (we created it earlier)
if [ ! -f "$BACKEND_DIR/api/main.py" ]; then
    echo -e "${YELLOW}⚠ API main.py not found - it should have been created during setup${NC}"
    echo -e "${YELLOW}  You may need to create it manually from the provided template${NC}"
fi

# Prepare frontend directory
echo ""
echo "🎨 Setting up frontend directory..."

# Create frontend structure
mkdir -p "$FRONTEND_DIR/src"
mkdir -p "$FRONTEND_DIR/public"

# Extract React app from Electron wrapper
echo "Extracting React frontend from Electron..."
if [ -d "$TEMP_DIR/Auto-Claude/auto-claude-ui" ]; then
    # Copy renderer process (React app)
    if [ -d "$TEMP_DIR/Auto-Claude/auto-claude-ui/src/renderer" ]; then
        cp -r "$TEMP_DIR/Auto-Claude/auto-claude-ui/src/renderer"/* "$FRONTEND_DIR/src/"
        echo -e "${GREEN}✓ React renderer code copied${NC}"
    else
        echo -e "${YELLOW}⚠ Renderer directory not found, copying entire src...${NC}"
        cp -r "$TEMP_DIR/Auto-Claude/auto-claude-ui/src"/* "$FRONTEND_DIR/src/"
    fi
    
    # Copy package.json (will be modified in Dockerfile)
    if [ -f "$TEMP_DIR/Auto-Claude/auto-claude-ui/package.json" ]; then
        cp "$TEMP_DIR/Auto-Claude/auto-claude-ui/package.json" "$FRONTEND_DIR/"
        echo -e "${GREEN}✓ package.json copied (will be processed during Docker build)${NC}"
    fi
    
    # Copy assets if they exist
    if [ -d "$TEMP_DIR/Auto-Claude/auto-claude-ui/public" ]; then
        cp -r "$TEMP_DIR/Auto-Claude/auto-claude-ui/public"/* "$FRONTEND_DIR/public/" 2>/dev/null || true
    fi
    
    # Copy shared types/utilities
    if [ -d "$TEMP_DIR/Auto-Claude/auto-claude-ui/src/shared" ]; then
        mkdir -p "$FRONTEND_DIR/src/shared"
        cp -r "$TEMP_DIR/Auto-Claude/auto-claude-ui/src/shared"/* "$FRONTEND_DIR/src/shared/"
    fi
    
else
    echo -e "${RED}❌ auto-claude-ui directory not found in repository${NC}"
    exit 1
fi

# Create vite.config.ts for standalone React app
echo "Creating Vite configuration..."
cat > "$FRONTEND_DIR/vite.config.ts" << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://backend:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
EOF

echo -e "${GREEN}✓ Vite config created${NC}"

# Update index.html to remove Electron-specific code
if [ -f "$FRONTEND_DIR/src/index.html" ]; then
    # Move index.html to root if needed
    mv "$FRONTEND_DIR/src/index.html" "$FRONTEND_DIR/index.html" 2>/dev/null || true
fi

# Create index.html if it doesn't exist
if [ ! -f "$FRONTEND_DIR/index.html" ]; then
    echo "Creating index.html..."
    cat > "$FRONTEND_DIR/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Auto-Claude</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
    echo -e "${GREEN}✓ index.html created${NC}"
fi

# Verify API client exists
if [ ! -f "$FRONTEND_DIR/src/api/client.ts" ]; then
    echo -e "${YELLOW}⚠ API client not found - it should have been created during setup${NC}"
    echo -e "${YELLOW}  You may need to create it manually from the provided template${NC}"
fi

# Create projects directory
echo ""
echo "📁 Creating projects directory..."
mkdir -p "$SCRIPT_DIR/projects"
echo -e "${GREEN}✓ Projects directory created${NC}"

# Clean up temp directory
echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"
echo -e "${GREEN}✓ Temporary files removed${NC}"

# Setup .env file
echo ""
echo "⚙️  Configuration Setup"
echo "======================"

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        echo -e "${GREEN}✓ .env file created from template${NC}"
    else
        # Create a basic .env if example doesn't exist
        cat > "$SCRIPT_DIR/.env" << 'EOF'
CLAUDE_CODE_OAUTH_TOKEN=
AUTO_BUILD_MODEL=claude-opus-4-5-20251101
PROJECTS_DIR=./projects
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
EOF
        echo -e "${GREEN}✓ .env file created${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}❗ IMPORTANT: You need to configure your Claude Code OAuth token${NC}"
    echo ""
    echo "To get your token:"
    echo "  1. Run: ${BLUE}claude setup-token${NC}"
    echo "  2. Copy the token that's displayed"
    echo "  3. Edit ${BLUE}.env${NC} and paste it as CLAUDE_CODE_OAUTH_TOKEN"
    echo ""
    
    # Check if claude CLI is available
    if command -v claude &> /dev/null; then
        echo -e "${GREEN}✓ Claude CLI is installed${NC}"
        echo ""
        read -p "Would you like to run 'claude setup-token' now? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            claude setup-token
            echo ""
            echo -e "${YELLOW}Now copy the token and paste it into .env${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Claude CLI not found. Install it with:${NC}"
        echo "  ${BLUE}npm install -g @anthropic-ai/claude-code${NC}"
    fi
    
    echo ""
    read -p "Press Enter when you've configured .env (or press Ctrl+C to exit and configure later)..."
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Note: Frontend dependencies will be installed during Docker build
echo ""
echo "📦 Frontend dependencies will be installed during Docker build..."
echo -e "${GREEN}✓ Frontend setup complete${NC}"

# Verify all required files exist
echo ""
echo "🔍 Verifying setup..."

MISSING_FILES=0

if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    echo -e "${RED}❌ docker-compose.yml not found${NC}"
    MISSING_FILES=1
fi

if [ ! -f "$BACKEND_DIR/Dockerfile" ]; then
    echo -e "${RED}❌ backend/Dockerfile not found${NC}"
    MISSING_FILES=1
fi

if [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
    echo -e "${RED}❌ backend/requirements.txt not found${NC}"
    MISSING_FILES=1
fi

if [ ! -f "$FRONTEND_DIR/Dockerfile" ]; then
    echo -e "${RED}❌ frontend/Dockerfile not found${NC}"
    MISSING_FILES=1
fi

if [ ! -f "$FRONTEND_DIR/nginx.conf" ]; then
    echo -e "${RED}❌ frontend/nginx.conf not found${NC}"
    MISSING_FILES=1
fi

if [ $MISSING_FILES -eq 1 ]; then
    echo ""
    echo -e "${RED}❌ Some required files are missing. Please ensure all template files are present.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All required files present${NC}"

# Summary
echo ""
echo "📊 Setup Summary"
echo "================"
echo -e "Backend source:  ${GREEN}✓${NC} ${BACKEND_DIR}/auto-claude/"
echo -e "Frontend source: ${GREEN}✓${NC} ${FRONTEND_DIR}/src/"
echo -e "Projects dir:    ${GREEN}✓${NC} ${SCRIPT_DIR}/projects/"
echo -e "Configuration:   ${GREEN}✓${NC} ${SCRIPT_DIR}/.env"

# Build containers
echo ""
echo "🔨 Building Docker containers..."
echo "This may take a few minutes on first run..."
docker-compose build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Containers built successfully${NC}"

# Start services
echo ""
read -p "Would you like to start Auto-Claude now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting Auto-Claude..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Auto-Claude is now running!${NC}"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "🌐 Web UI:        ${BLUE}http://localhost:3000${NC}"
        echo -e "🔧 API endpoint:  ${BLUE}http://localhost:8000${NC}"
        echo -e "📚 API docs:      ${BLUE}http://localhost:8000/docs${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Useful commands:"
        echo "  ${BLUE}docker-compose logs -f${NC}          View logs"
        echo "  ${BLUE}docker-compose down${NC}             Stop services"
        echo "  ${BLUE}docker-compose restart${NC}          Restart services"
        echo "  ${BLUE}docker-compose exec backend bash${NC} Backend shell"
        echo ""
        echo "Next steps:"
        echo "  1. Open ${BLUE}http://localhost:3000${NC} in your browser"
        echo "  2. Add a project from ${BLUE}./projects/${NC}"
        echo "  3. Create your first task"
        echo ""
    else
        echo -e "${RED}❌ Failed to start services${NC}"
        exit 1
    fi
else
    echo ""
    echo "Setup complete! To start Auto-Claude later, run:"
    echo "  ${BLUE}docker-compose up -d${NC}"
    echo ""
fi
