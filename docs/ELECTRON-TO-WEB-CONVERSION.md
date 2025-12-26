# Electron to Web Conversion Guide

## Current Status

### ✅ What's Working
- **Build System**: Frontend builds successfully with Vite
- **React Components**: All UI components render
- **Browser Mock**: Initialized and providing mock data
- **Styling**: Tailwind CSS loaded and functional
- **Docker Setup**: Containerized frontend + backend + redis

### ⚠️ What Needs Work
- **Kanban Board Layout**: Columns not displaying horizontally
- **IPC Replacement**: 318 `window.electronAPI` calls need REST/WebSocket equivalents
- **File Operations**: Need backend API for filesystem access
- **Real-time Events**: WebSocket connections for live updates

---

## IPC Channel Analysis

### Total IPC Usage
- **318 instances** of `window.electronAPI` calls across the frontend
- **150+ unique methods** that need conversion
- **15 store files** heavily dependent on IPC

### Critical IPC Channels (Priority Order)

#### 1. Project Operations (CRITICAL)
```typescript
// Current Electron IPC
window.electronAPI.getProjects() → IPCResult<Project[]>
window.electronAPI.addProject(path) → IPCResult<Project>
window.electronAPI.removeProject(id) → IPCResult

// Needs REST API
GET    /api/projects
POST   /api/projects
DELETE /api/projects/:id
```

#### 2. Task Operations (CRITICAL)
```typescript
// Current Electron IPC
window.electronAPI.getTasks(projectId) → IPCResult<Task[]>
window.electronAPI.createTask(projectId, title, desc) → IPCResult<Task>
window.electronAPI.updateTaskStatus(taskId, status) → IPCResult
window.electronAPI.startTask(taskId, options) → void
window.electronAPI.stopTask(taskId) → void

// Needs REST API + WebSocket
GET    /api/projects/:id/tasks
POST   /api/projects/:id/tasks
PATCH  /api/tasks/:id/status
POST   /api/tasks/:id/start
POST   /api/tasks/:id/stop

// Real-time events via WebSocket
ws://backend:8000/ws/tasks/:taskId
  - onTaskProgress
  - onTaskLog
  - onTaskStatusChange
  - onTaskError
```

#### 3. Terminal Operations (HIGH PRIORITY)
```typescript
// Current Electron IPC
window.electronAPI.createTerminal(opts) → IPCResult<TerminalSession>
window.electronAPI.sendTerminalInput(id, input) → void
window.electronAPI.resizeTerminal(id, cols, rows) → void
window.electronAPI.destroyTerminal(id) → void

// Events
window.electronAPI.onTerminalOutput(callback)
window.electronAPI.onTerminalExit(callback)

// Needs WebSocket
ws://backend:8000/ws/terminals/:id
  - Send: { type: 'input', data: string }
  - Send: { type: 'resize', cols, rows }
  - Receive: { type: 'output', data }
  - Receive: { type: 'exit', code }
```

#### 4. Settings (MEDIUM PRIORITY)
```typescript
// Current Electron IPC
window.electronAPI.getSettings() → IPCResult<AppSettings>
window.electronAPI.saveSettings(settings) → IPCResult

// Needs REST API or LocalStorage
GET  /api/settings
POST /api/settings

// OR store in browser localStorage
```

#### 5. File System Operations (MEDIUM PRIORITY)
```typescript
// Current Electron IPC
window.electronAPI.selectDirectory() → string
window.electronAPI.listDirectory(path) → IPCResult<FileNode[]>
window.electronAPI.readLocalImage(path) → IPCResult<string>

// Needs Backend API
POST /api/files/select-directory → Use <input type="file" webkitdirectory>
GET  /api/projects/:id/files?path=...
GET  /api/files/image?path=...
```

#### 6. Real-time Event Listeners (HIGH PRIORITY)
These need WebSocket implementations:
```typescript
// Build progress
onTaskProgress(callback)
onTaskLog(callback)
onTaskExecutionProgress(callback)

// Insights/AI sessions
onInsightsStreamChunk(callback)
onInsightsStatus(callback)

// Roadmap generation
onRoadmapProgress(callback)
onRoadmapComplete(callback)

// Terminal events
onTerminalOutput(callback)
onTerminalExit(callback)
onTerminalRateLimit(callback)

// System events
onUsageUpdated(callback)
onProactiveSwapNotification(callback)
```

---

## File Modification Map

### 🔴 High Priority Files (Kanban Board Functionality)

#### `frontend/src/stores/project-store.ts`
**IPC Calls**: `getProjects`, `addProject`, `removeProject`, `updateProjectSettings`, `initializeProject`
**Changes Needed**:
```typescript
// BEFORE
const result = await window.electronAPI.getProjects();

// AFTER
import { api } from '@/api/client';
const result = await api.getProjects();
```

#### `frontend/src/stores/task-store.ts`
**IPC Calls**: `getTasks`, `createTask`, `updateTask`, `startTask`, `stopTask`, `updateTaskStatus`, `onTaskProgress`, `onTaskLog`
**Changes Needed**:
```typescript
// BEFORE
await window.electronAPI.startTask(taskId);
window.electronAPI.onTaskProgress((_, data) => handleProgress(data));

// AFTER
import { api, TaskProgressMonitor } from '@/api/client';

await api.startTask(taskId);

const monitor = new TaskProgressMonitor(taskId);
monitor.on('progress', handleProgress);
monitor.on('log', handleLog);
monitor.on('complete', handleComplete);
monitor.start();
```

#### `frontend/src/components/KanbanBoard.tsx`
**IPC Calls**: None directly (uses stores)
**Changes Needed**:
- ✅ Already updated to use `bg-gradient-to-b`
- May need width/layout fixes for column display

#### `frontend/src/App.tsx`
**IPC Calls**: `getTabState`, `saveTabState`, `getSettings`, `onAppUpdateAvailable`, `onUsageUpdated`
**Changes Needed**:
```typescript
// Tab state can use localStorage or backend
localStorage.setItem('tabState', JSON.stringify(tabState));
const tabState = JSON.parse(localStorage.getItem('tabState') || '{}');

// Settings from backend or localStorage
const settings = await api.getSettings();
```

### 🟡 Medium Priority Files

#### Terminal Components
- `frontend/src/stores/terminal-store.ts`
- `frontend/src/components/TerminalGrid.tsx`
- `frontend/src/components/TerminalCard.tsx`

**Changes Needed**: Implement WebSocket-based terminal (xterm.js + Socket.IO/WebSocket)

#### Insights/AI Features
- `frontend/src/stores/insights-store.ts`
- `frontend/src/stores/roadmap-store.ts`
- `frontend/src/stores/ideation-store.ts`

**Changes Needed**: Server-Sent Events or WebSocket for streaming responses

#### Integrations
- `frontend/src/stores/github-store.ts`
- `frontend/src/components/settings/integrations/`

**Changes Needed**: OAuth flows, API proxying through backend

### 🟢 Low Priority Files

#### Changelog & Releases
- `frontend/src/stores/changelog-store.ts`
- `frontend/src/stores/release-store.ts`

#### File Explorer
- `frontend/src/stores/file-explorer-store.ts`

#### Context & Memory
- `frontend/src/stores/context-store.ts`

---

## API Client Implementation

### Current State
`frontend/src/api/client.ts` exists with basic structure:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class APIClient {
  async request<T>(endpoint, options) { ... }
  async getProjects() { ... }
  async createProject(project) { ... }
}

export const api = new APIClient();
```

### What Needs to Be Added

#### 1. Complete REST Methods
```typescript
class APIClient {
  // Projects
  async getProjects(): Promise<Project[]>
  async getProject(id: string): Promise<Project>
  async createProject(data: CreateProjectRequest): Promise<Project>
  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project>
  async deleteProject(id: string): Promise<void>

  // Tasks
  async getTasks(projectId: string): Promise<Task[]>
  async getTask(taskId: string): Promise<Task>
  async createTask(projectId: string, data: CreateTaskRequest): Promise<Task>
  async updateTask(taskId: string, data: UpdateTaskRequest): Promise<Task>
  async deleteTask(taskId: string): Promise<void>
  async startTask(taskId: string, options?: TaskStartOptions): Promise<void>
  async stopTask(taskId: string): Promise<void>
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>

  // Settings
  async getSettings(): Promise<AppSettings>
  async saveSettings(settings: AppSettings): Promise<void>

  // More methods...
}
```

#### 2. WebSocket Monitors
```typescript
class TaskProgressMonitor {
  private ws: WebSocket;
  private listeners: Map<string, Function[]>;

  constructor(private taskId: string) {
    this.ws = new WebSocket(`${WS_URL}/ws/tasks/${taskId}`);
    this.listeners = new Map();
  }

  on(event: 'progress' | 'log' | 'complete' | 'error', callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  start() {
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit(data.type, data.payload);
    };
  }

  stop() {
    this.ws.close();
  }
}

class TerminalSession {
  private ws: WebSocket;

  constructor(private terminalId: string) {
    this.ws = new WebSocket(`${WS_URL}/ws/terminals/${terminalId}`);
  }

  sendInput(data: string) {
    this.ws.send(JSON.stringify({ type: 'input', data }));
  }

  resize(cols: number, rows: number) {
    this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  onOutput(callback: (data: string) => void) {
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') callback(msg.data);
    };
  }
}
```

---

## Backend API Requirements

### FastAPI Endpoints Needed

```python
# backend/api/main.py

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST Endpoints
@app.get("/api/projects")
async def get_projects():
    # Call auto-claude Python backend
    pass

@app.post("/api/projects")
async def create_project(data: CreateProjectRequest):
    pass

@app.get("/api/projects/{project_id}/tasks")
async def get_tasks(project_id: str):
    pass

@app.post("/api/tasks/{task_id}/start")
async def start_task(task_id: str, options: TaskStartOptions):
    # Start auto-claude build process
    # Stream progress via WebSocket
    pass

# WebSocket Endpoints
@app.websocket("/ws/tasks/{task_id}")
async def task_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()

    # Stream task progress, logs, status changes
    async for event in monitor_task(task_id):
        await websocket.send_json(event)

@app.websocket("/ws/terminals/{terminal_id}")
async def terminal_websocket(websocket: WebSocket, terminal_id: str):
    await websocket.accept()

    # Bidirectional terminal I/O
    pty = create_pty(terminal_id)

    async def send_output():
        async for data in pty.read():
            await websocket.send_json({"type": "output", "data": data})

    async def receive_input():
        async for message in websocket.iter_json():
            if message["type"] == "input":
                pty.write(message["data"])
            elif message["type"] == "resize":
                pty.resize(message["cols"], message["rows"])
```

---

## Migration Strategy

### Phase 1: Core Functionality (CURRENT)
**Goal**: Get Kanban board working with mock data

1. ✅ Setup Docker containers
2. ✅ Build frontend with Vite
3. ✅ Initialize browser mock
4. ⚠️ Fix Kanban board layout rendering
5. ⚠️ Ensure mock data displays properly

### Phase 2: Real Backend Integration
**Goal**: Replace mocks with FastAPI backend

1. Create FastAPI endpoints for:
   - Projects CRUD
   - Tasks CRUD
   - Settings storage
2. Update stores to use `api.client` instead of `window.electronAPI`
3. Test full flow: create project → create task → view in Kanban

### Phase 3: Real-time Features
**Goal**: WebSocket-based live updates

1. Implement WebSocket endpoints for:
   - Task progress monitoring
   - Terminal I/O streaming
   - Insights/AI chat streaming
2. Create WebSocket client classes
3. Update UI components to use WebSocket monitors

### Phase 4: File Operations
**Goal**: Handle filesystem access

1. File picker: Use `<input type="file" webkitdirectory>`
2. File browser: Backend API endpoint
3. Image loading: Backend proxy endpoint

### Phase 5: Advanced Features
**Goal**: Full feature parity

1. GitHub integration (OAuth flow)
2. Linear integration
3. Changelog generation
4. Release management
5. Roadmap planning
6. Ideation sessions

---

## Known Limitations (Browser vs Electron)

### Cannot Be Replicated
1. **Native File Dialogs**: Use HTML file inputs instead
2. **System Tray**: No browser equivalent
3. **Native Menus**: Use web-based menu components
4. **Auto-Updater**: Manual browser refresh or service workers
5. **Filesystem Access**: Limited to user-selected files or backend API

### Workarounds Available
1. **File Selection**: `<input type="file" webkitdirectory>`
2. **Local Storage**: IndexedDB or localStorage
3. **Notifications**: Web Notifications API (requires permission)
4. **Clipboard**: Clipboard API (requires user gesture)

---

## Testing Checklist

### Unit Tests
- [ ] API client methods
- [ ] WebSocket monitors
- [ ] Store mutations
- [ ] Component rendering

### Integration Tests
- [ ] Project creation flow
- [ ] Task management flow
- [ ] Settings persistence
- [ ] Real-time updates

### E2E Tests (Playwright)
- [ ] Create project
- [ ] Create task
- [ ] Start task
- [ ] Monitor progress
- [ ] Complete task
- [ ] View in Kanban board

---

## Current Debugging

### Kanban Board Not Showing
**Symptoms**: Sidebar visible, main content area dark/empty

**Possible Causes**:
1. `selectedProject` is null → Kanban wrapped in `{selectedProject && ...}`
2. Tasks not loading from mock
3. CSS layout issue (flex/grid not working)
4. Background color same as foreground

**Debug Steps**:
1. Check browser console for `selectedProject` value
2. Check if tasks are loaded: inspect `tasks` array in React DevTools
3. Inspect element: verify Kanban board DOM exists
4. Check computed CSS: verify flex layout applied

**Next Actions**:
1. Add console.log in KanbanBoard component to verify it's rendering
2. Check if tasks array has data
3. Verify CSS classes are applied
4. Test with different theme (light vs dark)
