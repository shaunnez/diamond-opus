#!/usr/bin/env bash
# Generate consolidated documentation from package READMEs
# Usage: npm run docs:generate
# Output: docs/DIAMOND_OPUS_FULL.md (concatenated from all READMEs)
# Note: docs/DIAMOND_OPUS.md is the curated summary for Notion

set -euo pipefail

OUTPUT="docs/DIAMOND_OPUS_FULL.md"
SEPARATOR="---"

echo "Generating consolidated documentation → $OUTPUT"

cat > "$OUTPUT" << 'HEADER'
# Diamond Opus - Consolidated Documentation

> Auto-generated from package READMEs. Run `npm run docs:generate` to regenerate.
> Last generated: GENERATED_DATE

---

HEADER

# Replace placeholder with actual date
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/GENERATED_DATE/$(date -u '+%Y-%m-%d %H:%M UTC')/" "$OUTPUT"
else
  sed -i "s/GENERATED_DATE/$(date -u '+%Y-%m-%d %H:%M UTC')/" "$OUTPUT"
fi

# Function to append a README with a section header
append_readme() {
  local file="$1"
  local label="$2"

  if [ -f "$file" ]; then
    echo "" >> "$OUTPUT"
    echo "## $label" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    # Skip the first H1 line (title) from each README to avoid duplicate headers
    tail -n +2 "$file" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    echo "$SEPARATOR" >> "$OUTPUT"
  else
    echo "  WARN: $file not found, skipping"
  fi
}

# Core project docs
append_readme "README.md" "Project Overview (README.md)"

# Package docs
append_readme "packages/shared/README.md" "Package: @diamond/shared"
append_readme "packages/database/README.md" "Package: @diamond/database"
append_readme "packages/nivoda/README.md" "Package: @diamond/nivoda"
append_readme "packages/pricing-engine/README.md" "Package: @diamond/pricing-engine"
append_readme "packages/api/README.md" "Package: @diamond/api"

# App docs
append_readme "apps/scheduler/README.md" "App: Scheduler"
append_readme "apps/worker/README.md" "App: Worker"
append_readme "apps/consolidator/README.md" "App: Consolidator"

# Infrastructure docs
append_readme "infrastructure/README.md" "Infrastructure"
append_readme "infrastructure/terraform/README.md" "Terraform Configuration"
append_readme "docker/README.md" "Docker"
append_readme "sql/README.md" "SQL Schema"

# Additional docs
append_readme "docs/GITHUB_SECRETS_CHECKLIST.md" "GitHub Secrets Checklist"

# Append TODO
append_readme "TODO.md" "TODO / Future Enhancements"

echo ""
echo "Done! Generated: $OUTPUT"
echo "Lines: $(wc -l < "$OUTPUT")"
