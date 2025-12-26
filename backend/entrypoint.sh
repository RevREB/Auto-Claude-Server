#!/bin/bash
set -e

# Configure git to use gh CLI for authentication (if gh is logged in)
if gh auth status &>/dev/null; then
    echo "[Entrypoint] Setting up git to use GitHub CLI credentials..."
    gh auth setup-git
    echo "[Entrypoint] Git credential helper configured"
else
    echo "[Entrypoint] GitHub CLI not authenticated, skipping git credential setup"
fi

# Configure git defaults
git config --global user.email "auto-claude@localhost"
git config --global user.name "Auto Claude"
git config --global init.defaultBranch main

# Start the application
exec "$@"
