# Skill Backup Strategy - Comprehensive Guide

**Part of:** OpenClaw Backup to S3 Skill

---

## Skill Types & Backup Needs

### 1. Custom/Local Skills ⚠️ CRITICAL

**What:** Skills you built or modified, not in any registry

**Examples:**
- `bedrock-models` (your custom Bedrock skill)
- Any skill in active development
- Modified versions of registry skills

**Must backup:**
- ✅ All source code (`bin/`, `lib/`, `src/`)
- ✅ Configuration (`package.json`, `SKILL.md`, `.env`)
- ✅ Documentation (`README.md`, `docs/`)
- ✅ Tests (`test/`, `__tests__/`)
- ❌ Dependencies (`node_modules/` - can reinstall)

**Why critical:** Can't be reinstalled from registry

---

### 2. Registry Skills (ClawHub/NPM) ℹ️ OPTIONAL

**What:** Skills installed from public registries

**Examples:**
- `@openclaw/healthcheck`
- `@openclaw/openai-whisper`
- Any skill from ClawHub

**Backup approach:**
- ✅ Track name + version in manifest
- ❌ Don't backup source (can reinstall)

**Why optional:** Can reinstall with:
```bash
openclaw skill install @openclaw/healthcheck
```

---

### 3. Workspace Skills 🔧 CRITICAL

**What:** Skills in development, stored in workspace

**Location:** `~/.openclaw/workspace/skills/`

**Examples:**
- `s3-files` (your S3 upload tool)
- Any WIP skills

**Must backup:**
- ✅ All source code
- ✅ Configuration
- ✅ Work in progress
- ✅ Part of workspace backup (already covered)

**Why critical:** May not be published, part of active work

---

## Backup Strategies

### Strategy A: Full Backup (Everything)

**What it does:**
```bash
# Backup entire skills directory including node_modules
tar -czf skills-full.tar.gz ~/.openclaw/skills/
aws s3 cp skills-full.tar.gz s3://bucket/
```

**Pros:**
- Simple, one command
- Instant restore (no npm install needed)
- Exact environment preserved

**Cons:**
- Large file size (hundreds of MB with node_modules)
- Slow upload/download
- Duplicates packages available elsewhere

**Best for:** Critical production systems, rare backups

---

### Strategy B: Source Only (Recommended)

**What it does:**
```bash
# Backup source, skip node_modules
aws s3 sync ~/.openclaw/skills/ s3://bucket/skills/ \
  --exclude "*/node_modules/*" \
  --exclude "*/.git/*" \
  --exclude "*/dist/*" \
  --exclude "*/coverage/*"
```

**Pros:**
- Much smaller (10-50 MB typically)
- Fast backup/restore
- Still preserves all custom code

**Cons:**
- Need to run `npm install` on restore
- Takes 2-5 minutes extra per skill

**Best for:** Daily automated backups, development environments

---

### Strategy C: Smart Detection (Optimal)

**What it does:**
```javascript
// Detect skill type and backup accordingly
const skills = listSkills('~/.openclaw/skills/');

for (const skill of skills) {
  if (isCustomSkill(skill)) {
    // Backup full source (no node_modules)
    backupSource(skill);
  } else if (isRegistrySkill(skill)) {
    // Just record name@version
    recordInManifest(skill.name, skill.version);
  }
}
```

**Pros:**
- Minimal backup size
- Only stores what's truly needed
- Registry skills auto-reinstalled

**Cons:**
- More complex logic
- Need to detect skill source

**Best for:** Framework integration, multi-agent systems

---

## Skill Manifest

**Track installed skills in manifest:**

```json
{
  "skills": {
    "custom": [
      {
        "name": "bedrock-models",
        "location": "~/.openclaw/skills/bedrock-models",
        "version": "1.1.0",
        "type": "custom",
        "backed_up": true,
        "s3_key": "skills/bedrock-models/source.tar.gz"
      }
    ],
    "registry": [
      {
        "name": "@openclaw/healthcheck",
        "version": "1.0.0",
        "registry": "npm",
        "install_command": "openclaw skill install @openclaw/healthcheck"
      }
    ],
    "workspace": [
      {
        "name": "s3-files",
        "location": "~/.openclaw/workspace/skills/s3-files",
        "backed_up": true,
        "s3_key": "workspace/skills/s3-files/"
      }
    ]
  }
}
```

---

## Restore Procedure for Skills

### Phase 1: Restore Custom Skills

```bash
# Download custom skills
aws s3 sync s3://bucket/skills/ ~/.openclaw/skills/ \
  --exclude "*/node_modules/*"

# Install dependencies
for skill in ~/.openclaw/skills/*/; do
  if [ -f "$skill/package.json" ]; then
    echo "Installing dependencies for $(basename $skill)"
    cd "$skill"
    npm install --production
  fi
done
```

### Phase 2: Reinstall Registry Skills

```bash
# Read manifest
REGISTRY_SKILLS=$(jq -r '.skills.registry[] | "\(.name)@\(.version)"' manifest.json)

# Install each
for skill in $REGISTRY_SKILLS; do
  openclaw skill install "$skill"
done
```

### Phase 3: Verify Workspace Skills

```bash
# Workspace skills already restored with workspace backup
# Just verify they're accessible
openclaw skill list
```

---

## Special Cases

### Case 1: Skill with External Dependencies

**Example:** Skill needs system packages

**Backup:**
```json
{
  "name": "my-skill",
  "system_dependencies": [
    "ffmpeg",
    "imagemagick",
    "python3-opencv"
  ]
}
```

**Restore:**
```bash
# Install system deps first
sudo apt install ffmpeg imagemagick python3-opencv
# Then restore skill
npm install
```

### Case 2: Skill with Secrets

**Example:** Skill has API keys

**Backup:** Don't backup secrets!
```bash
# Exclude .env files
aws s3 sync ... --exclude "*/.env"
```

**Restore:** Manual configuration
```bash
# User must reconfigure
cd ~/.openclaw/skills/my-skill
cp .env.example .env
# Edit .env with actual keys
```

### Case 3: Skill with Database

**Example:** Skill uses local SQLite

**Backup:**
```bash
# Include database files
aws s3 cp ~/.openclaw/skills/my-skill/data.db s3://bucket/
```

**Restore:**
```bash
# Restore database
aws s3 cp s3://bucket/data.db ~/.openclaw/skills/my-skill/
```

---

## Validation After Restore

### Skill Integrity Checks

```bash
# Check all skills load
openclaw skill list

# Check custom skills
openclaw-bedrock-models --version

# Check workspace skills
node ~/.openclaw/workspace/skills/s3-files/upload.js --help

# Run skill tests (if they exist)
cd ~/.openclaw/skills/bedrock-models
npm test
```

### Common Issues

**Issue:** npm install fails
```bash
# Solution: Clear npm cache
npm cache clean --force
npm install
```

**Issue:** Skill command not found
```bash
# Solution: Reinstall globally linked skills
cd ~/.openclaw/skills/bedrock-models
npm link
```

**Issue:** Permission errors
```bash
# Solution: Fix ownership
sudo chown -R ubuntu:ubuntu ~/.openclaw/skills/
```

---

## Performance Optimization

### Parallel Restore

```bash
# Install dependencies in parallel
for skill in ~/.openclaw/skills/*/; do
  (
    cd "$skill"
    if [ -f package.json ]; then
      npm install --production &
    fi
  )
done
wait
```

### Incremental Backup

```bash
# Only backup skills that changed
for skill in ~/.openclaw/skills/*/; do
  SKILL_HASH=$(find "$skill" -type f -name "*.js" -exec md5sum {} \; | sort | md5sum)
  LAST_HASH=$(cat "$skill/.backup-hash" 2>/dev/null || echo "")
  
  if [ "$SKILL_HASH" != "$LAST_HASH" ]; then
    echo "Backing up $(basename $skill)"
    backup_skill "$skill"
    echo "$SKILL_HASH" > "$skill/.backup-hash"
  fi
done
```

---

## Size Estimates

**Typical skill sizes:**

```
Custom skill (source only):
  bedrock-models: ~500 KB
  + node_modules: ~15 MB

Registry skill (reinstalled):
  @openclaw/healthcheck: 0 bytes (just manifest)

Workspace skill:
  s3-files: ~50 KB
  + node_modules: ~5 MB

Total estimate (your setup):
  Source only: ~1 MB
  With node_modules: ~20 MB
```

---

## Recommendation for Your Setup

**Current skills:**
1. `bedrock-models` (custom, in `~/.openclaw/skills/`)
2. `s3-files` (workspace, in `~/.openclaw/workspace/skills/`)

**Recommended strategy:**

```bash
# Backup bedrock-models source
aws s3 sync ~/.openclaw/skills/bedrock-models/ \
  s3://bucket/skills/bedrock-models/ \
  --exclude "node_modules/*"

# s3-files backed up with workspace
# (already covered in workspace backup)

# Create manifest
cat > skill-manifest.json << EOF
{
  "skills": {
    "custom": ["bedrock-models@1.1.0"],
    "workspace": ["s3-files"]
  }
}
EOF

aws s3 cp skill-manifest.json s3://bucket/
```

**Restore:**
```bash
# Restore bedrock-models
aws s3 sync s3://bucket/skills/bedrock-models/ \
  ~/.openclaw/skills/bedrock-models/
cd ~/.openclaw/skills/bedrock-models
npm install

# s3-files restored with workspace
cd ~/.openclaw/workspace/skills/s3-files
npm install
```

---

## Future: Framework Integration

**When integrating with Agentic Framework:**

```javascript
// Framework can backup skills per agent
agentic-framework backup manager --include-skills

// Or selective
agentic-framework backup worker-1 --include-skill my-custom-skill
```

**Use cases:**
- Worker needs specific skill
- Backup worker + skill together
- Restore worker with exact environment

---

**Bottom line:** Backup source code for custom skills, track registry skills in manifest, let npm reinstall dependencies.
