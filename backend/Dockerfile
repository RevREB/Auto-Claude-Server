FROM python:3.11-slim

# Install system dependencies and GitHub CLI
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (required for Claude Code CLI)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Auto-Claude Python backend
COPY auto-claude/ ./auto-claude/

# Copy FastAPI wrapper
COPY api/ ./api/

# Create necessary directories
RUN mkdir -p /app/projects /app/.auto-claude

# Create Claude CLI and GitHub CLI directories with proper permissions
# Claude CLI needs to write to ~/.claude for config and debug logs
# GitHub CLI needs to write to ~/.config/gh for authentication
RUN mkdir -p /root/.claude/debug /root/.config/claude /root/.config/gh && \
    chmod -R 755 /root/.claude /root/.config

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run FastAPI with uvicorn via entrypoint
# Entrypoint sets up git credentials and other runtime config
# Disable hot reload - running tasks modify files which trigger unwanted reloads
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
