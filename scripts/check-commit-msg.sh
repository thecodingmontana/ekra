#!/bin/sh
# Commit messages: Conventional Commits, no co-author or AI attribution trailers.
msg_file="$1"
first_line=$(head -n 1 "$msg_file")

case "$first_line" in
Merge\ * | Revert\ *) exit 0 ;;
esac

if ! printf '%s\n' "$first_line" | grep -qE '^(feat|fix|refactor|docs|test|chore|perf|ci|build|revert)(\([a-z0-9-]+\))?!?: .+'; then
	echo "Commit message must follow Conventional Commits, e.g. 'feat(api): add sign-in' or 'fix: EKR-12 broken upload'." >&2
	echo "Got: $first_line" >&2
	exit 1
fi

if grep -qiE '^co-authored-by:|generated with .*claude|noreply@anthropic\.com' "$msg_file"; then
	echo "Remove Co-Authored-By and AI attribution lines from the commit message." >&2
	exit 1
fi
