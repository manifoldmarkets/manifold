#!/bin/bash

ENV=${1:-dev}
DEBUG=${2:-false}

# Set environment based on whether "prod" is in the ENV string
if [[ "$ENV" == *"prod"* ]]; then
    FIREBASE_PROJECT=prod
    NEXT_ENV=PROD
else
    FIREBASE_PROJECT=dev
    NEXT_ENV=DEV
fi

# Set working directory and other environment-specific variables
if [[ "$ENV" == mani:* ]]; then
    WORKING_DIR="mani"
    # Try to get local IP address from WiFi interface first, then ethernet
    LOCAL_IP=$(ipconfig getifaddr en0)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ipconfig getifaddr en1)
    fi
else
    WORKING_DIR="web"
    LOCAL_IP="localhost"
fi

firebase use $FIREBASE_PROJECT

API_COMMAND="dev"
if [ "$DEBUG" = "true" ]; then
    API_COMMAND="debug"
fi

# Fallback to localhost if no IP is found for mani environments
if [[ "$ENV" == mani:* ]] && [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
    echo "Warning: Could not detect local IP address, using localhost"
elif [[ "$ENV" == mani:* ]]; then
    echo "Using local IP address: $LOCAL_IP"
fi

# You need to install tmux, on mac you can do this with `brew install tmux`
if [[ "$ENV" == mani:* ]]; then
    # Create a new tmux session
    SESSION_NAME="mani-dev"
    
    # Kill existing session if it exists
    tmux kill-session -t $SESSION_NAME 2>/dev/null

    # Create new session with API server
    tmux new-session -d -s $SESSION_NAME "NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=backend/api $API_COMMAND"
    
    # Split window horizontally and start Expo
    tmux split-window -h "NEXT_PUBLIC_API_URL=${LOCAL_IP}:8088 NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=${WORKING_DIR} start:${FIREBASE_PROJECT}"
    
    # Select the Expo pane (for input)
    tmux select-pane -t 1
    
    # Attach to the session
    tmux attach-session -t $SESSION_NAME
else
    # For web environments, use concurrently
    npx concurrently \
        -n "API,NEXT,TS" \
        -c "white,magenta,cyan" \
        "NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=backend/api $API_COMMAND" \
        "NEXT_PUBLIC_API_URL=${LOCAL_IP}:8088 NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} yarn --cwd=${WORKING_DIR} serve" \
        "yarn --cwd=${WORKING_DIR} ts-watch"
fi
