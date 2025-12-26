# Volume Management & Backup Strategy

## Overview

Auto-Claude uses Docker named volumes (not bind mounts) to ensure compatibility with Kubernetes PersistentVolumeClaims (PVCs). All persistent data is stored in managed volumes.

## Volumes

### 1. `projects-data` (User Projects)
- **Path**: `/app/projects`
- **Size**: 50Gi (recommended)
- **Purpose**: Stores user code projects
- **Critical**: YES - contains user work
- **K8s Mapping**: PVC with ReadWriteOnce

### 2. `claude-data` (Claude OAuth Tokens)
- **Path**: `/root/.claude`
- **Size**: 1Gi
- **Purpose**: Claude.ai OAuth tokens and profiles
- **Critical**: YES - contains authentication
- **K8s Mapping**: PVC with ReadWriteOnce
- **Security**: Sensitive - encrypt at rest

### 3. `github-data` (GitHub OAuth Tokens)
- **Path**: `/root/.config/gh`
- **Size**: 1Gi
- **Purpose**: GitHub CLI OAuth tokens and configuration
- **Critical**: YES - contains authentication
- **K8s Mapping**: PVC with ReadWriteOnce
- **Security**: Sensitive - encrypt at rest

### 4. `auto-claude-data` (Application State)
- **Path**: `/app/.auto-claude`
- **Size**: 5Gi
- **Purpose**: Auto-Claude state and metadata
- **Critical**: YES - contains task history
- **K8s Mapping**: PVC with ReadWriteOnce

### 5. `redis-data` (Session Data)
- **Path**: `/data` (inside Redis container)
- **Size**: 10Gi
- **Purpose**: Task queues and session management
- **Critical**: MODERATE - can be rebuilt
- **K8s Mapping**: PVC with ReadWriteOnce

## Backup Strategy

### Docker Compose (Development/Single-Node)

```bash
# Backup all volumes
docker run --rm \
  -v auto-claude-docker_projects-data:/source/projects:ro \
  -v auto-claude-docker_claude-data:/source/claude:ro \
  -v auto-claude-docker_auto-claude-data:/source/auto-claude:ro \
  -v auto-claude-docker_redis-data:/source/redis:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/auto-claude-backup-$(date +%Y%m%d-%H%M%S).tar.gz /source

# Restore volumes
docker run --rm \
  -v auto-claude-docker_projects-data:/restore/projects \
  -v auto-claude-docker_claude-data:/restore/claude \
  -v auto-claude-docker_auto-claude-data:/restore/auto-claude \
  -v auto-claude-docker_redis-data:/restore/redis \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd / && tar xzf /backup/auto-claude-backup-TIMESTAMP.tar.gz --strip-components=1"
```

### Kubernetes (Production)

#### Option 1: Velero (Recommended)
```bash
# Install Velero with your cloud provider
velero install --provider aws --bucket auto-claude-backups

# Create scheduled backup
velero schedule create auto-claude-daily \
  --schedule="@daily" \
  --include-namespaces=auto-claude

# Restore from backup
velero restore create --from-backup auto-claude-daily-20250124
```

#### Option 2: Volume Snapshots
```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: auto-claude-projects-snapshot
spec:
  volumeSnapshotClassName: csi-snapshot-class
  source:
    persistentVolumeClaimName: auto-claude-projects
```

#### Option 3: CronJob Backup
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: auto-claude-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          volumes:
            - name: projects
              persistentVolumeClaim:
                claimName: auto-claude-projects
            - name: backup
              persistentVolumeClaim:
                claimName: backup-storage
          containers:
          - name: backup
            image: alpine:latest
            command:
            - /bin/sh
            - -c
            - tar czf /backup/projects-$(date +%Y%m%d).tar.gz /data/projects
            volumeMounts:
            - name: projects
              mountPath: /data/projects
              readOnly: true
            - name: backup
              mountPath: /backup
          restartPolicy: OnFailure
```

## Migration Path

### From Bind Mount to Volume
```bash
# 1. Stop services
docker-compose down

# 2. Update docker-compose.yml to use named volumes

# 3. Start services (creates empty volumes)
docker-compose up -d

# 4. Copy data from host to volume
docker cp ./projects/. CONTAINER_NAME:/app/projects/

# 5. Fix ownership
docker exec CONTAINER_NAME chown -R root:root /app/projects
```

### From Docker to Kubernetes
1. Backup Docker volumes using backup script
2. Create PVCs in Kubernetes cluster
3. Create temporary pod with PVC mounted
4. Copy backup data into PVC
5. Deploy application pods

## Storage Classes

Recommended storage classes by environment:

- **Development**: `standard` (local disk)
- **Production**: `fast-ssd` or cloud provider equivalent
- **Sensitive Data** (`claude-data`): Encryption-enabled storage class

## Retention Policy

- **Daily backups**: Keep 7 days
- **Weekly backups**: Keep 4 weeks
- **Monthly backups**: Keep 12 months
- **Critical changes**: Manual backup before major operations

## Monitoring

Monitor volume usage:
```bash
# Docker
docker system df -v

# Kubernetes
kubectl get pvc -n auto-claude
kubectl top pvc -n auto-claude
```

## Disaster Recovery

1. **Complete System Loss**: Restore from latest backup to new cluster
2. **Data Corruption**: Restore specific volume from incremental backup
3. **Accidental Deletion**: Restore from most recent snapshot (within RTO)

**RTO Target**: 4 hours
**RPO Target**: 1 hour (incremental backups)
