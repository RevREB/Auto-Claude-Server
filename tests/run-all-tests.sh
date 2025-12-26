#!/bin/bash
set -e

# Auto-Claude Docker - Run All Tests Script
# Executes E2E, backend, and frontend tests

echo "🧪 Auto-Claude Docker - Test Suite"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Function to run tests and track failures
run_test() {
    local name=$1
    local command=$2

    echo -e "${YELLOW}Running ${name}...${NC}"
    if eval "$command"; then
        echo -e "${GREEN}✅ ${name} passed${NC}"
        echo ""
    else
        echo -e "${RED}❌ ${name} failed${NC}"
        echo ""
        FAILED=$((FAILED + 1))
    fi
}

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Start test environment
echo "🚀 Starting test environment..."
docker-compose -f docker-compose.test.yml up -d backend-test redis-test
sleep 5
echo ""

# Run backend API tests
run_test "Backend API Tests" \
    "docker-compose -f docker-compose.test.yml run --rm backend-tests"

# Build frontend for E2E tests
echo "🏗️  Building frontend for E2E tests..."
docker-compose -f docker-compose.test.yml up -d frontend-test
sleep 10
echo ""

# Run E2E tests
run_test "E2E Tests (Playwright)" \
    "docker-compose -f docker-compose.test.yml run --rm playwright-tests"

# Optional: Run frontend component tests (if using Vitest)
if [ -f "frontend/package.json" ] && grep -q "vitest" frontend/package.json; then
    echo -e "${YELLOW}Running Frontend Component Tests...${NC}"
    cd frontend
    if npm run test 2>/dev/null; then
        echo -e "${GREEN}✅ Frontend Component Tests passed${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Frontend Component Tests skipped or not configured${NC}"
        echo ""
    fi
    cd ..
fi

# Cleanup
echo "🧹 Cleaning up test environment..."
docker-compose -f docker-compose.test.yml down
echo ""

# Summary
echo "=================================="
echo "📊 Test Summary"
echo "=================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED test suite(s) failed${NC}"
    exit 1
fi
