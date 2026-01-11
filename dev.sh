#!/bin/bash

# Parse arguments
DEBUG=false
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            DEBUG=true
            shift
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

ENV=${POSITIONAL_ARGS[0]:-dev}
API_PORT=${POSITIONAL_ARGS[1]:-8088}

# Set environment based on whether "prod" is in the ENV string
if [[ "$ENV" == *"prod"* ]]; then
    FIREBASE_PROJECT=prod
    NEXT_ENV=PROD
else
    FIREBASE_PROJECT=dev
    NEXT_ENV=DEV
fi

# Set working directory and other environment-specific variables
if [[ "$ENV" == native:* ]]; then
    # Try to get local IP address from WiFi interface first, then ethernet
    LOCAL_IP=$(ipconfig getifaddr en0)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ipconfig getifaddr en1)
    fi
else
    LOCAL_IP="localhost"
fi

firebase use $FIREBASE_PROJECT

API_COMMAND="dev"
if [ "$DEBUG" = "true" ]; then
    API_COMMAND="debug"
fi

# Fallback to localhost if no IP is found for mani environments
if [[ "$ENV" == native:* ]] && [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
    echo "Warning: Could not detect local IP address, using localhost"
elif [[ "$ENV" == native:* ]]; then
    echo "Using local IP address: $LOCAL_IP"
fi

# You need to install tmux, on mac you can do this with `brew install tmux`
if [[ "$ENV" == native:* ]]; then
    # Create a new tmux session
    SESSION_NAME="native-dev"
    
    # Kill existing session if it exists
    tmux kill-session -t $SESSION_NAME 2>/dev/null

    # Create new session with API server
    tmux new-session -d -s $SESSION_NAME "PORT=${API_PORT} NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=backend/api $API_COMMAND"
    
    # Split window horizontally and start Expo
    tmux split-window -h "NEXT_PUBLIC_API_URL=${LOCAL_IP}:${API_PORT} NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=native start:${FIREBASE_PROJECT}"
    
    # Select the Expo pane (for input)
    tmux select-pane -t 1
    
    # Attach to the session
    tmux attach-session -t $SESSION_NAME
else
npx concurrently \
    -n API,NEXT,TS \
    -c white,magenta,cyan \
    "cross-env PORT=${API_PORT} \
              NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
              yarn --cwd=backend/api $API_COMMAND" \
    "cross-env NEXT_PUBLIC_API_URL=${LOCAL_IP}:${API_PORT} \
              NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
              yarn --cwd=web serve" \
    "cross-env yarn --cwd=web ts-watch"
fi