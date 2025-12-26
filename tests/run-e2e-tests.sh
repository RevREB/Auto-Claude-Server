#!/bin/bash
set -e

# Auto-Claude Docker - Run E2E Tests Only
# Runs Playwright end-to-end tests

echo "🎭 Running E2E Tests (Playwright)"
echo "================================="
echo ""

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Start services
echo "🚀 Starting test environment..."
docker-compose -f docker-compose.test.yml up -d backend-test redis-test frontend-test

echo "⏳ Waiting for services to be ready..."
sleep 10

# Wait for backend health check
echo "🔍 Checking backend health..."
max_attempts=30
attempt=0
until curl -f http://localhost:8001/health >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Backend failed to start"
        docker-compose -f docker-compose.test.yml logs backend-test
        docker-compose -f docker-compose.test.yml down
        exit 1
    fi
    echo "  Waiting for backend... ($attempt/$max_attempts)"
    sleep 2
done

echo "✅ Backend is ready"
echo ""

# Run Playwright tests
echo "🧪 Running Playwright tests..."
if docker-compose -f docker-compose.test.yml run --rm playwright-tests; then
    echo ""
    echo "✅ E2E tests passed!"
    docker-compose -f docker-compose.test.yml down
    exit 0
else
    echo ""
    echo "❌ E2E tests failed"
    echo ""
    echo "📋 Backend logs:"
    docker-compose -f docker-compose.test.yml logs --tail=50 backend-test
    echo ""
    echo "📋 Frontend logs:"
    docker-compose -f docker-compose.test.yml logs --tail=50 frontend-test
    docker-compose -f docker-compose.test.yml down
    exit 1
fi
