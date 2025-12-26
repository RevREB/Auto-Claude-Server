#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔍 Auto-Claude Docker Setup Verification"
echo "========================================"
echo ""

ISSUES=0

# Check Docker
echo "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not installed${NC}"
    ISSUES=$((ISSUES + 1))
else
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✓ Docker: ${DOCKER_VERSION}${NC}"
fi

# Check docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not installed${NC}"
    ISSUES=$((ISSUES + 1))
else
    COMPOSE_VERSION=$(docker-compose --version)
    echo -e "${GREEN}✓ docker-compose: ${COMPOSE_VERSION}${NC}"
fi

# Check Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not installed${NC}"
    ISSUES=$((ISSUES + 1))
else
    GIT_VERSION=$(git --version)
    echo -e "${GREEN}✓ Git: ${GIT_VERSION}${NC}"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not installed${NC}"
    ISSUES=$((ISSUES + 1))
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js: ${NODE_VERSION}${NC}"
fi

echo ""
echo "Checking directory structure..."

# Check required directories
declare -a REQUIRED_DIRS=(
    "backend"
    "backend/api"
    "backend/auto-claude"
    "frontend"
    "frontend/src"
    "projects"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓ $dir/${NC}"
    else
        echo -e "${RED}❌ Missing: $dir/${NC}"
        ISSUES=$((ISSUES + 1))
    fi
done

echo ""
echo "Checking required files..."

# Check required files
declare -a REQUIRED_FILES=(
    "docker-compose.yml"
    ".env.example"
    "backend/Dockerfile"
    "backend/requirements.txt"
    "backend/api/main.py"
    "frontend/Dockerfile"
    "frontend/nginx.conf"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}❌ Missing: $file${NC}"
        ISSUES=$((ISSUES + 1))
    fi
done

echo ""
echo "Checking configuration..."

if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    # Check if OAuth token is set
    if grep -q "CLAUDE_CODE_OAUTH_TOKEN=.*[^=]" .env; then
        echo -e "${GREEN}✓ OAuth token appears to be configured${NC}"
    else
        echo -e "${YELLOW}⚠ OAuth token not set in .env${NC}"
        echo -e "${YELLOW}  Run: claude setup-token${NC}"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "${YELLOW}⚠ .env file not found (will be created during setup)${NC}"
fi

echo ""
echo "Checking source code..."

# Check if Auto-Claude backend code exists
if [ -d "backend/auto-claude" ] && [ "$(ls -A backend/auto-claude)" ]; then
    FILE_COUNT=$(find backend/auto-claude -type f | wc -l)
    echo -e "${GREEN}✓ Backend source code present (${FILE_COUNT} files)${NC}"
else
    echo -e "${YELLOW}⚠ Backend source code not present (will be cloned during setup)${NC}"
fi

# Check if frontend source exists
if [ -d "frontend/src" ] && [ "$(ls -A frontend/src)" ]; then
    FILE_COUNT=$(find frontend/src -type f | wc -l)
    echo -e "${GREEN}✓ Frontend source code present (${FILE_COUNT} files)${NC}"
else
    echo -e "${YELLOW}⚠ Frontend source code not present (will be cloned during setup)${NC}"
fi

echo ""
echo "Checking Docker daemon..."

if docker info &> /dev/null; then
    echo -e "${GREEN}✓ Docker daemon is running${NC}"
else
    echo -e "${RED}❌ Docker daemon not running${NC}"
    echo -e "${YELLOW}  Start Docker Desktop or run: sudo systemctl start docker${NC}"
    ISSUES=$((ISSUES + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! You're ready to run ./setup.sh${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ${BLUE}./setup.sh${NC}"
    echo "  2. Configure your OAuth token in .env"
    echo "  3. Access the app at http://localhost:3000"
else
    echo -e "${YELLOW}⚠ Found $ISSUES issue(s) that need attention${NC}"
    echo ""
    echo "Please resolve the issues above before running setup.sh"
    echo ""
    echo "Common fixes:"
    echo "  • Install Docker Desktop: ${BLUE}https://www.docker.com/products/docker-desktop${NC}"
    echo "  • Install Git: ${BLUE}https://git-scm.com/downloads${NC}"
    echo "  • Install Node.js: ${BLUE}https://nodejs.org/${NC}"
    echo "  • Start Docker daemon: ${BLUE}sudo systemctl start docker${NC}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $ISSUES
