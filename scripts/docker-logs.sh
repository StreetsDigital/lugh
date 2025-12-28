#!/bin/bash
# docker-logs.sh - Collect and manage Docker container logs
#
# Usage:
#   ./scripts/docker-logs.sh              # Follow logs from all services
#   ./scripts/docker-logs.sh --save       # Save logs to file
#   ./scripts/docker-logs.sh --tail 100   # Show last 100 lines
#   ./scripts/docker-logs.sh app          # Logs from app service only
#   ./scripts/docker-logs.sh --status     # Show container status

set -e

# Configuration
LOG_DIR="${LUGH_LOG_DIR:-./logs}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

show_help() {
  cat << EOF
Docker Log Manager for Lugh

Usage: $0 [OPTIONS] [SERVICE]

Options:
  --save           Save logs to file in $LOG_DIR
  --tail N         Show last N lines (default: follow all)
  --since TIME     Show logs since timestamp (e.g., "1h", "2023-01-01")
  --status         Show container status and health
  --rotate         Rotate log files (keep last 5)
  -f FILE          Use specific docker-compose file
  -h, --help       Show this help message

Services:
  app              Application container logs
  postgres         Database container logs
  (none)           All services

Examples:
  $0                           # Follow all logs in real-time
  $0 --save                    # Save current logs to file
  $0 --tail 200 app            # Last 200 lines from app
  $0 --since 1h                # Logs from last hour
  $0 -f docker-compose.yml     # Use development compose file

Log files are saved to: $LOG_DIR/
EOF
}

ensure_log_dir() {
  if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    print_info "Created log directory: $LOG_DIR"
  fi
}

detect_compose_file() {
  # Auto-detect which compose file to use based on what's running
  if docker compose -f docker-compose.prod.yml ps --quiet 2>/dev/null | grep -q .; then
    COMPOSE_FILE="docker-compose.prod.yml"
  elif docker compose -f docker-compose.staging.yml ps --quiet 2>/dev/null | grep -q .; then
    COMPOSE_FILE="docker-compose.staging.yml"
  elif docker compose -f docker-compose.yml --profile with-db ps --quiet 2>/dev/null | grep -q .; then
    COMPOSE_FILE="docker-compose.yml"
  elif docker compose -f docker-compose.yml --profile external-db ps --quiet 2>/dev/null | grep -q .; then
    COMPOSE_FILE="docker-compose.yml"
  fi
}

show_status() {
  print_info "Container Status"
  echo "========================================"

  detect_compose_file
  print_info "Using: $COMPOSE_FILE"
  echo ""

  docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || {
    # Try with profile for base docker-compose.yml
    docker compose -f docker-compose.yml --profile with-db ps 2>/dev/null || \
    docker compose -f docker-compose.yml --profile external-db ps 2>/dev/null || \
    print_error "No containers found"
  }

  echo ""
  print_info "Container Health"
  echo "----------------------------------------"

  # Show health status for each container
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -20

  echo ""
  print_info "Resource Usage"
  echo "----------------------------------------"
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -10
}

save_logs() {
  local service="$1"
  local tail_lines="$2"
  local since="$3"

  ensure_log_dir
  detect_compose_file

  local log_file="$LOG_DIR/lugh_${TIMESTAMP}.log"
  if [ -n "$service" ]; then
    log_file="$LOG_DIR/lugh_${service}_${TIMESTAMP}.log"
  fi

  print_info "Saving logs to: $log_file"

  # Build docker compose logs command
  local cmd="docker compose -f $COMPOSE_FILE logs"

  if [ -n "$tail_lines" ]; then
    cmd="$cmd --tail $tail_lines"
  fi

  if [ -n "$since" ]; then
    cmd="$cmd --since $since"
  fi

  cmd="$cmd --timestamps"

  if [ -n "$service" ]; then
    cmd="$cmd $service"
  fi

  # Execute and save
  $cmd > "$log_file" 2>&1 || {
    # Try with profile for base docker-compose.yml
    docker compose -f docker-compose.yml --profile with-db logs --timestamps ${tail_lines:+--tail $tail_lines} ${since:+--since $since} ${service} > "$log_file" 2>&1 || \
    print_error "Failed to collect logs"
    return 1
  }

  local line_count=$(wc -l < "$log_file")
  print_success "Saved $line_count lines to $log_file"

  # Also save current container status
  local status_file="$LOG_DIR/status_${TIMESTAMP}.txt"
  {
    echo "Container Status at $(date)"
    echo "========================================"
    docker ps -a
    echo ""
    echo "Docker Stats:"
    docker stats --no-stream
  } > "$status_file" 2>&1

  print_success "Status saved to $status_file"
}

rotate_logs() {
  ensure_log_dir

  print_info "Rotating logs (keeping last 5)"

  # Keep only the last 5 log files
  ls -t "$LOG_DIR"/lugh_*.log 2>/dev/null | tail -n +6 | xargs -r rm -v
  ls -t "$LOG_DIR"/status_*.txt 2>/dev/null | tail -n +6 | xargs -r rm -v

  print_success "Log rotation complete"

  # Show remaining files
  echo ""
  print_info "Current log files:"
  ls -lh "$LOG_DIR"/*.log 2>/dev/null || echo "  (no log files)"
}

follow_logs() {
  local service="$1"
  local tail_lines="${2:-50}"
  local since="$3"

  detect_compose_file
  print_info "Following logs from $COMPOSE_FILE"
  print_info "Press Ctrl+C to stop"
  echo ""

  # Build command
  local cmd="docker compose -f $COMPOSE_FILE logs"
  cmd="$cmd --follow"
  cmd="$cmd --tail $tail_lines"

  if [ -n "$since" ]; then
    cmd="$cmd --since $since"
  fi

  cmd="$cmd --timestamps"

  if [ -n "$service" ]; then
    cmd="$cmd $service"
  fi

  $cmd 2>/dev/null || {
    # Try with profile
    docker compose -f docker-compose.yml --profile with-db logs --follow --tail "$tail_lines" --timestamps ${since:+--since $since} ${service} 2>/dev/null || \
    docker compose -f docker-compose.yml --profile external-db logs --follow --tail "$tail_lines" --timestamps ${since:+--since $since} ${service} 2>/dev/null || \
    print_error "Failed to follow logs. Are containers running?"
  }
}

# Parse arguments
ACTION="follow"
SERVICE=""
TAIL_LINES=""
SINCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --save)
      ACTION="save"
      shift
      ;;
    --tail)
      TAIL_LINES="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
      shift 2
      ;;
    --status)
      ACTION="status"
      shift
      ;;
    --rotate)
      ACTION="rotate"
      shift
      ;;
    -f)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    -*)
      print_error "Unknown option: $1"
      show_help
      exit 1
      ;;
    *)
      SERVICE="$1"
      shift
      ;;
  esac
done

# Execute action
case $ACTION in
  follow)
    follow_logs "$SERVICE" "$TAIL_LINES" "$SINCE"
    ;;
  save)
    save_logs "$SERVICE" "$TAIL_LINES" "$SINCE"
    ;;
  status)
    show_status
    ;;
  rotate)
    rotate_logs
    ;;
esac
