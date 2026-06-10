#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  ./scripts/init_deploy.sh [ENV_FILE]

Default ENV_FILE is .env.prod.

This script creates runtime directories, loads production environment variables,
runs collectstatic, and runs Django system checks.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${1:-.env.prod}"
VENV_DIR="${CODEMARK_VENV_DIR:-.venv}"

if [[ "$ENV_FILE" != /* ]]; then
    ENV_FILE="$PROJECT_DIR/$ENV_FILE"
fi

if [[ "$VENV_DIR" != /* ]]; then
    VENV_DIR="$PROJECT_DIR/$VENV_DIR"
fi

VENV_ACTIVATE="$VENV_DIR/bin/activate"

cd "$PROJECT_DIR"

echo "==> Creating runtime directories"
mkdir -p logs media/sharecode staticfiles
touch logs/.gitkeep media/.gitkeep

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing environment file: $ENV_FILE" >&2
    echo "Create .env.prod first, then run this script again." >&2
    exit 1
fi

if [[ ! -f "$VENV_ACTIVATE" ]]; then
    echo "Missing virtual environment: $VENV_DIR" >&2
    echo "Create it first: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
fi

echo "==> Activating virtual environment"
source "$VENV_ACTIVATE"

echo "==> Loading environment file: $ENV_FILE"
set -a
source "$ENV_FILE"
set +a
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-codemark_project.settings.prod}"

echo "==> Collecting static files"
python manage.py collectstatic --noinput

echo "==> Running Django checks"
python manage.py check

echo "==> Deployment initialization complete"
