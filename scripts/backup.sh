#!/bin/bash
set -e

# Auto-Claude Volume Backup Script
# Works with both Docker Compose and prepares for Kubernetes migration

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="auto-claude-backup-${TIMESTAMP}.tar.gz"
PROJECT_NAME="auto-claude-docker"

echo "🔄 Starting Auto-Claude backup..."
echo "📁 Backup directory: ${BACKUP_DIR}"
echo "📦 Backup file: ${BACKUP_NAME}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Run backup container
docker run --rm \
  -v ${PROJECT_NAME}_projects-data:/source/projects:ro \
  -v ${PROJECT_NAME}_claude-data:/source/claude:ro \
  -v ${PROJECT_NAME}_github-data:/source/github:ro \
  -v ${PROJECT_NAME}_auto-claude-data:/source/auto-claude:ro \
  -v ${PROJECT_NAME}_redis-data:/source/redis:ro \
  -v "$(pwd)/${BACKUP_DIR}:/backup" \
  alpine tar czf "/backup/${BACKUP_NAME}" /source

echo "✅ Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}"
echo "📊 Backup size: $(du -h "${BACKUP_DIR}/${BACKUP_NAME}" | cut -f1)"

# Optional: Clean up old backups (keep last 7 days)
if [ "${CLEANUP_OLD:-false}" = "true" ]; then
  echo "🧹 Cleaning up backups older than 7 days..."
  find "${BACKUP_DIR}" -name "auto-claude-backup-*.tar.gz" -type f -mtime +7 -delete
  echo "✅ Cleanup completed"
fi

echo "🎉 Backup complete!"
