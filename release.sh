#!/usr/bin/env bash
# Release script: merge develop -> main, tag, sync develop (see plan).
# Run locally on develop or via GitHub Actions (Release workflow).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ensure_yq() {
  if command -v yq >/dev/null 2>&1; then
    return 0
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    print_error "yq is required. Install with: brew install yq"
    exit 1
  fi
  print_info "Installing yq (Linux)..."
  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
  sudo chmod +x /usr/local/bin/yq
}

if [[ -z "${1:-}" ]]; then
  print_error "Usage: $0 <version>"
  print_info "Example: $0 1.3.0"
  exit 1
fi

VERSION="$1"
RELEASE_BRANCH="release/v${VERSION}"
CURRENT_DATE=$(date +%Y-%m-%d)

ensure_yq

if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  print_error "Version must be semantic (e.g. 1.2.3)"
  exit 1
fi

if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  print_info "Running in GitHub Actions"
else
  print_info "Running locally"
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  print_error "You must be on the 'develop' branch to create a release"
  print_info "Current branch: $CURRENT_BRANCH"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  print_error "Working directory is not clean"
  git status --short
  exit 1
fi

print_info "Fetching origin..."
git fetch origin
LOCAL=$(git rev-parse develop)
REMOTE=$(git rev-parse origin/develop)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  print_error "develop is not up to date with origin/develop"
  print_info "Run: git pull origin develop"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
  print_error "Branch $RELEASE_BRANCH already exists"
  exit 1
fi

if git show-ref --verify --quiet "refs/tags/$VERSION"; then
  print_error "Tag $VERSION already exists"
  exit 1
fi

if ! grep -q '\[Next\]' CHANGELOG.md; then
  print_error "No [Next] section found in CHANGELOG.md"
  exit 1
fi

print_info "Creating release branch: $RELEASE_BRANCH"
git checkout -b "$RELEASE_BRANCH"

print_info "Updating version in config.yaml and package.json"
yq eval --inplace ".version = \"${VERSION}\"" config.yaml
npm version "${VERSION}" --no-git-tag-version

print_info "Updating CHANGELOG.md"
if [[ "$(uname -s)" == "Darwin" ]]; then
  sed -i '' "s/\\[Next\\]/[${VERSION}] - ${CURRENT_DATE}/" CHANGELOG.md
else
  sed -i.bak "s/\\[Next\\]/[${VERSION}] - ${CURRENT_DATE}/" CHANGELOG.md
  rm -f CHANGELOG.md.bak
fi

git add config.yaml package.json package-lock.json CHANGELOG.md
git commit -m "Release v${VERSION}

- Update version in config.yaml and package.json to ${VERSION}
- Update CHANGELOG.md with release date"

print_info "Pushing release branch"
git push origin "$RELEASE_BRANCH"

print_info "Merging into main"
git checkout main
git pull origin main

if ! git merge "$RELEASE_BRANCH" --no-ff -m "Merge release v${VERSION}"; then
  if git status --short | grep -q '^UU config.yaml'; then
    print_warning "Merge conflict in config.yaml; using release branch version"
    git checkout --theirs config.yaml
    git add config.yaml
    git commit --no-edit
  else
    print_error "Merge failed; resolve conflicts manually"
    exit 1
  fi
fi

print_info "Creating tag ${VERSION}"
git tag "${VERSION}"

print_info "Pushing main and tag"
git push origin main
git push origin "${VERSION}"

print_info "Syncing develop"
git checkout develop
git pull origin develop
git merge main --no-ff -m "Sync develop with main after release v${VERSION}"

print_info "Resetting config.yaml to next and package.json to 0.0.0-dev"
yq eval --inplace '.version = "next"' config.yaml
npm version 0.0.0-dev --no-git-tag-version

if ! grep -q '\[Next\]' CHANGELOG.md; then
  print_info "Adding new [Next] section to CHANGELOG.md"
  awk 'NR==1{print; print ""; print "## [Next]"; print ""; next}1' CHANGELOG.md > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
fi

git add config.yaml package.json package-lock.json CHANGELOG.md
git commit -m "Prepare develop for next cycle after v${VERSION}"

print_info "Pushing develop"
git push origin develop

print_success "Release v${VERSION} completed"
print_info "Next: create GitHub Release from tag ${VERSION} if not using Actions"
