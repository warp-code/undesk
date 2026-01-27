#!/bin/bash

# Localnet wallet to airdrop SOL to
LOCALNET_WALLET="D2vay1cNFWQmiDGUY4m5c6JmpzjmHxHwXiCypqZL8eZk"

clear

# Clean up any existing processes
./kill-validator.sh

trap 'kill 0' SIGINT SIGTERM EXIT

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
PURPLE='\033[0;95m'
DIM='\033[0;90m'
NC='\033[0m' # No Color

# Function to prefix output with colored label
run_with_prefix() {
    local color=$1
    local label=$2
    shift 2
    "$@" 2>&1 | while IFS= read -r line; do
        echo -e "${color}[${label}]${NC} $line"
    done
}

# echo -e "${DIM}Press 's' to toggle solana-test-validator output${NC}\n"
echo -e "${DIM}Press 'a' to toggle arcium localnet output${NC}\n"

# Solana process with toggleable output (uses signals, no temp files)
# DISABLED: arcium localnet already runs solana-test-validator
# (
#     show=1
#     auto_hidden=0
#
#     toggle() {
#         if [ "$show" = "1" ]; then
#             show=0
#             echo -e "${DIM}[solana output hidden - press 's' to show]${NC}"
#         else
#             show=1
#             echo -e "${GREEN}[solana output visible - press 's' to hide]${NC}"
#         fi
#     }
#     trap toggle USR1
#
#     # Process substitution keeps while loop in same shell (variables persist, trap works)
#     while IFS= read -r line; do
#         if [ "$show" = "1" ]; then
#             echo -e "${GREEN}[solana  ]${NC} $line"
#             if [[ "$line" == *"Processed Slot"* ]] && [ "$auto_hidden" = "0" ]; then
#                 auto_hidden=1
#                 show=0
#                 echo -e "${DIM}[solana output auto-hidden - press 's' to show]${NC}"
#             fi
#         fi
#     done < <(solana-test-validator --reset 2>&1)
# ) &
# SOLANA_PID=$!

# Main script PID for signaling
MAIN_PID=$$
arcium_ready=0

# Handle ready signal from arcium
trap 'arcium_ready=1' USR2

# Arcium process with toggleable output (uses signals, no temp files)
(
    show=1
    auto_hidden=0
    main_pid=$MAIN_PID  # Capture from parent shell

    toggle() {
        if [ "$show" = "1" ]; then
            show=0
            echo -e "${DIM}[arcium output hidden - press 'a' to show]${NC}"
        else
            show=1
            echo -e "${PURPLE}[arcium output visible - press 'a' to hide]${NC}"
        fi
    }
    trap toggle USR1

    while IFS= read -r line; do
        if [ "$show" = "1" ]; then
            echo -e "${PURPLE}[arcium  ]${NC} $line"
            if [[ "$line" == *"Processed Slot: 1"* ]] && [ "$auto_hidden" = "0" ]; then
                auto_hidden=1
                show=0
                echo -e "${DIM}[arcium output auto-hidden - press 'a' to show]${NC}"
                # Airdrop SOL to localnet wallet after 1 second
                if [ -n "$LOCALNET_WALLET" ]; then
                    sleep 1
                    solana airdrop 5 "$LOCALNET_WALLET" -u l >/dev/null 2>&1 && \
                        echo -e "${DIM}Airdropped 5 SOL to $LOCALNET_WALLET${NC}"
                fi
                # Signal main script that arcium is ready
                kill -USR2 "$main_pid" 2>/dev/null
            fi
        fi
    done < <(arcium localnet 2>&1)
) &
ARCIUM_PID=$!

# Wait for arcium to be ready
echo -e "${DIM}Waiting for arcium to be ready...${NC}"
while [ "$arcium_ready" = "0" ]; do
    sleep 1
done
echo -e "${DIM}Arcium ready, starting other services...${NC}"

# Now start other processes (except cranker)
run_with_prefix "$CYAN"    "indexer " bash -c "cd ./packages/indexer && ARCIUM_CLUSTER_OFFSET=0 yarn start" &
run_with_prefix "$MAGENTA" "supabase" supabase start &
run_with_prefix "$BLUE"    "frontend" yarn dev &

# Run tests, then start cranker after tests finish
(
    sleep 20
    echo -e "${DIM}[test    ]${NC} Running anchor test..."
    ARCIUM_CLUSTER_OFFSET=0 anchor test --skip-build --skip-deploy --skip-local-validator 2>&1 | while IFS= read -r line; do
        echo -e "${DIM}[test    ]${NC} $line"
    done
    echo -e "${DIM}[test    ]${NC} Anchor test finished"

    # Start cranker after tests
    echo -e "${DIM}Starting cranker...${NC}"
    run_with_prefix "$YELLOW" "cranker " bash -c "cd ./packages/cranker && ARCIUM_CLUSTER_OFFSET=0 yarn start"
) &

# Keyboard listener
while true; do
    if read -rsn1 key < /dev/tty 2>/dev/null; then
        if [ "$key" = "a" ]; then
            kill -USR1 "$ARCIUM_PID" 2>/dev/null
        fi
        # DISABLED: solana-test-validator not running separately
        # if [ "$key" = "s" ]; then
        #     kill -USR1 "$SOLANA_PID" 2>/dev/null
        # fi
    fi
done &

wait

# Clean up any remaining processes
./kill-validator.sh
