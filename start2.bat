#!/bin/bash

# 1. Get the directory where the script is located
# This prevents "Cannot GET /index.html" errors
PARENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$PARENT_DIR"

# 2. Kill existing processes on ports
# Using || true ensures the script doesn't stop if no process is found
fuser -k 5001/tcp || true
fuser -k 5500/tcp || true

# 3. Start Backend
if [ -d "$PARENT_DIR/server" ]; then
    echo "Starting AI Validation Backend..."
    cd "$PARENT_DIR/server"
    # Opens a new terminal tab/window for the backend
    gnome-terminal -- bash -c "node app.js; exec bash"
else
    echo "Error: Server directory not found at $PARENT_DIR/server"
fi

# 4. Start Frontend
echo "Starting Front-End Static Web Server..."
cd "$PARENT_DIR"
# Force npx to use the current directory explicitly 
# -y flag avoids the "Need to install http-server? (y/n)" prompt
npx -y http-server . -p 5500 -c-1 &

# 5. Wait and Open Browser [cite: 4]
sleep 3
xdg-open "http://127.0.0.1:5500/index.html" || echo "Please open http://127.0.0.1:5500/index.html manually"

echo "System ready!"