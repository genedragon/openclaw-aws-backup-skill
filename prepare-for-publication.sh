#!/bin/bash
# Prepare openclaw-backup-skill for GitHub publication

set -e

echo "🧹 Cleaning repo for publication..."

# Files to remove (development artifacts)
FILES_TO_REMOVE=(
  "BACKUP-TEST-STATUS.md"
  "CODE-CHANGES-SUMMARY.md"
  "DELIVERABLES.md"
  "DELIVERY-SUMMARY.md"
  "MVP-CHECKPOINT.md"
  "PHASE2-COMPLETE.md"
  "PROJECT-UPDATES-SUMMARY.md"
  "PROJECT.md"
  "TASK-COMPLETE-REPORT.md"
  "TEST-PLAN-MULTI-INSTANCE.md"
  "TESTING-CHECKLIST.md"
  "test-encryption-options.js"
  "verify-delivery.sh"
  "config/test-config-kms.json"
  "config/test-config-no-encryption.json"
)

echo "Removing development artifacts..."
for file in "${FILES_TO_REMOVE[@]}"; do
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✓ Removed $file"
  fi
done

# Redact identifiable info in remaining files
echo ""
echo "Redacting identifiable information..."

# Function to redact in file
redact() {
  local file=$1
  if [ -f "$file" ]; then
    # Replace specific IPs, instance IDs, bucket names
    sed -i 's/34\.222\.206\.193/XX.XXX.XXX.XXX/g' "$file"
    sed -i 's/i-03ba5430ae2a2f302/i-XXXXXXXXXXXXX/g' "$file"
    sed -i 's/i-0[a-f0-9]\{17\}/i-XXXXXXXXXXXXX/g' "$file"
    sed -i 's/botward-bucket-021426/your-backup-bucket/g' "$file"
    sed -i 's/botward-bucket-021026/your-backup-bucket/g' "$file"
    sed -i 's/botward-openclaw-backups/your-backup-bucket/g' "$file"
    sed -i 's/322691663598/XXXXXXXXXXXX/g' "$file"
    
    # Replace personal names (keep in examples but make generic)
    sed -i 's/Gene/your-user/g' "$file"
    sed -i 's/Thomas/ExampleUser/g' "$file"
    sed -i 's/Marvin/TestAgent/g' "$file"
    sed -i 's/BotWard/YourAgent/g' "$file"
    sed -i 's/DevBot/DevAgent/g' "$file"
    
    echo "  ✓ Redacted $file"
  fi
}

# Redact remaining markdown files
for file in *.md; do
  redact "$file"
done

# Redact docs
for file in docs/*.md; do
  redact "$file"
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Files remaining:"
find . -type f -not -path "./node_modules/*" -not -path "./.git/*" | sort
echo ""
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Test basic functionality still works"
echo "3. Commit: git add -A && git commit -m 'Prepare for publication'"
echo "4. Create GitHub repo and push"
