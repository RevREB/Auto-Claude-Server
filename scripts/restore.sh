#!/bin/bash
set -e

# Auto-Claude Volume Restore Script
# Works with both Docker Compose and prepares for Kubernetes migration

BACKUP_FILE="${1}"
PROJECT_NAME="auto-claude-docker"

if [ -z "${BACKUP_FILE}" ]; then
  echo "❌ Error: Backup file not specified"
  echo "Usage: ./restore.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -lh ./backups/auto-claude-backup-*.tar.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "⚠️  WARNING: This will overwrite existing data!"
echo "📦 Restoring from: ${BACKUP_FILE}"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "❌ Restore cancelled"
  exit 0
fi

echo "🔄 Stopping services..."
docker-compose down

echo "🔄 Restoring volumes..."
docker run --rm \
  -v ${PROJECT_NAME}_projects-data:/restore/projects \
  -v ${PROJECT_NAME}_claude-data:/restore/claude \
  -v ${PROJECT_NAME}_github-data:/restore/github \
  -v ${PROJECT_NAME}_auto-claude-data:/restore/auto-claude \
  -v ${PROJECT_NAME}_redis-data:/restore/redis \
  -v "$(pwd)/$(dirname ${BACKUP_FILE}):/backup" \
  alpine sh -c "cd / && tar xzf /backup/$(basename ${BACKUP_FILE}) --strip-components=1"

echo "🔄 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 5

echo "✅ Restore completed successfully!"
echo "🎉 Auto-Claude is back online!"
