#!/usr/bin/env bash
# sync-to-github.sh
#
# Repo: https://github.com/vicharashala-ui/ecoguesser.git
#
# Run this from inside your local EcoGuesser project folder whenever you want
# to push edited files up to GitHub.
#
# Usage:
#   ./sync-to-github.sh                        # auto-generated commit message
#   ./sync-to-github.sh "useDailyRound fixes"  # your own commit message

set -e

REPO_URL="https://github.com/vicharashala-ui/ecoguesser.git"

# --- Make sure this folder is a git repo; offer to set one up if not -------
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "This folder isn't a git repo yet."
  read -p "Initialize one here and connect it to $REPO_URL ? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    git init
    git remote add origin "$REPO_URL"
  else
    echo "Aborting -- cd into your EcoGuesser folder first, then re-run."
    exit 1
  fi
fi

# --- Make sure 'origin' actually points somewhere ---------------------------
if ! git remote get-url origin > /dev/null 2>&1; then
  echo "No 'origin' remote set -- adding it now."
  git remote add origin "$REPO_URL"
fi

# --- Bail early if there's nothing to commit ---------------------------------
if [ -z "$(git status --porcelain)" ]; then
  echo "No local changes to commit. Nothing to push."
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
MSG="${1:-sync: $(date '+%Y-%m-%d %H:%M')}"

echo "Branch: $BRANCH"
echo "Staging all changes..."
git add -A

echo "Committing: \"$MSG\""
git commit -m "$MSG"

# Pull --rebase first, but only if that branch already exists on origin --
# on your very first push there's nothing to pull yet.
if git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  echo "Pulling latest from origin/$BRANCH (rebase)..."
  if ! git pull --rebase origin "$BRANCH"; then
    echo ""
    echo "Pull/rebase hit a conflict -- resolve it manually, then run:"
    echo "  git rebase --continue && git push -u origin $BRANCH"
    exit 1
  fi
else
  echo "Branch '$BRANCH' doesn't exist on origin yet -- this will be the first push."
fi

echo "Pushing to origin/$BRANCH..."
git push -u origin "$BRANCH"

echo ""
echo "Done. https://github.com/vicharashala-ui/ecoguesser is up to date."
