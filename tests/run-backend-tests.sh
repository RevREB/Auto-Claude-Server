#!/bin/bash
set -e

# Auto-Claude Docker - Run Backend Tests Only
# Runs pytest backend API tests

echo "🐍 Running Backend API Tests (pytest)"
echo "====================================="
echo ""

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Parse arguments
PYTEST_ARGS="${@:-"-v"}"

# Start services
echo "🚀 Starting test environment..."
docker-compose -f docker-compose.test.yml up -d backend-test redis-test

echo "⏳ Waiting for services to be ready..."
sleep 5

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

# Run pytest
echo "🧪 Running pytest with args: $PYTEST_ARGS"
if docker-compose -f docker-compose.test.yml run --rm backend-tests sh -c "pip install -q -r /app/tests/requirements.txt && pytest $PYTEST_ARGS"; then
    echo ""
    echo "✅ Backend tests passed!"
    docker-compose -f docker-compose.test.yml down
    exit 0
else
    echo ""
    echo "❌ Backend tests failed"
    echo ""
    echo "📋 Backend logs:"
    docker-compose -f docker-compose.test.yml logs --tail=50 backend-test
    docker-compose -f docker-compose.test.yml down
    exit 1
fi
