#!/bin/bash

# 1. Get the directory where the script is located
PARENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$PARENT_DIR"

# 2. Kill existing processes on ports (Silent)
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 5500/tcp 2>/dev/null || true

# 3. Start Backend in a new window
if [ -d "./server" ]; then
    echo "Starting AI Validation Backend..."
    gnome-terminal -- bash -c "cd '$PARENT_DIR/server'; node app.js; exec bash"
else
    echo "Error: ./server directory not found!"
fi

# 4. Start Frontend in background
echo "Starting Front-End Static Web Server..."
npx -y http-server . -p 5500 -c-1 &

# 5. Wait for server and launch browser
sleep 2
echo "System ready! Opening browser..."
xdg-open "http://127.0.0.1:5500/index.html"