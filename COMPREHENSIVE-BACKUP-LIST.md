# OpenClaw Backup to S3 - Comprehensive Rebuild List

**Started:** 2026-02-19
**Status:** Planning
**Objective:** Create complete backup system to rebuild OpenClaw instance and resume conversations exactly where they left off

---

## Goal

Capture **everything** needed to:
1. Spin up new EC2 instance
2. Restore OpenClaw installation
3. Resume conversations with full context
4. Restore all skills, projects, and state

**Test criteria:** After restore, your-user should be able to continue our conversation and I should remember everything.

---

## Critical Files & Directories

### 1. OpenClaw Core Configuration

**Location:** `~/.openclaw/`

**Must backup:**
```
~/.openclaw/
├── openclaw.json              # Core config (models, channels, cron)
├── agents/                    # Agent definitions
│   └── main/
│       ├── agent.json         # Main agent config
│       └── sessions/
│           └── sessions.json  # Active conversation sessions
├── channels/                  # Telegram, Signal, etc. configs
│   └── telegram/
│       └── channel.json
├── cron/                      # Scheduled jobs
│   └── jobs.json
├── logs/                      # Recent logs (optional but useful)
└── gateway.key                # Gateway auth key
```

**Why critical:**
- `openclaw.json` - Model settings, channel configs, all preferences
- `sessions.json` - **This is the conversation state!**
- `agent.json` - Agent personality, tools, settings
- Cron jobs - Daily stock report, reminders, scheduled tasks

---

### 2. Workspace (All Projects & Memory)

**Location:** `~/.openclaw/workspace/`

**Must backup:**
```
~/.openclaw/workspace/
├── AGENTS.md                  # Operating instructions
├── SOUL.md                    # Personality/identity
├── USER.md                    # Info about your-user
├── IDENTITY.md                # Name, avatar, metadata
├── PROJECTS.md                # Active projects index
├── TOOLS.md                   # Local notes (cameras, SSH, etc.)
├── HEARTBEAT.md               # Periodic check instructions
├── memory/                    # Daily memory logs
│   ├── 2026-02-18.md
│   ├── 2026-02-19.md
│   └── MEMORY.md              # Long-term curated memory
├── bedrock-discovery/         # Project: Bedrock models skill
├── stock-report-reliability/  # Project: Stock report fix
├── secure-proxy/              # Project: Credential proxy
├── agentic-framework/         # Project: Multi-agent framework
├── openclaw-aws-backup-skill/     # This project!
└── skills/                    # Local skills
    ├── s3-files/
    └── [any other local skills]
```

**Why critical:**
- AGENTS.md, SOUL.md, USER.md - Core identity and operating procedures
- memory/ - All context from previous conversations
- Projects - Current work in progress
- Skills - Custom capabilities

---

### 3. Installed Skills

**Location:** `~/.openclaw/skills/`

**Must backup:**
```
~/.openclaw/skills/
├── bedrock-models/            # Custom skill: Bedrock inference profiles
│   ├── bin/
│   ├── lib/
│   ├── package.json
│   ├── package-lock.json
│   └── node_modules/          # Optional (can npm install)
└── [other installed skills]
```

**Skill Types to Handle:**

1. **Custom/Local Skills** (CRITICAL - must backup)
   - bedrock-models (your custom skill)
   - Any unpublished skills
   - Modified skills
   - **Why:** Can't reinstall from registry

2. **Registry Skills** (CAN SKIP - just backup package.json)
   - Installed from ClawHub or npm
   - Can reinstall with: `openclaw skill install <name>`
   - **Backup:** Just track which are installed

3. **Workspace Skills** (CRITICAL - part of workspace)
   - Located in `~/.openclaw/workspace/skills/`
   - s3-files skill (your custom tool)
   - Development/WIP skills
   - **Why:** May not be published yet

**Backup Strategy:**

**Option A: Backup Everything (Simple)**
```bash
# Backup all skills with node_modules
aws s3 sync ~/.openclaw/skills/ s3://bucket/skills/
```
**Pros:** Complete, no reinstall needed
**Cons:** Large (node_modules), slow

**Option B: Backup Source, Skip Dependencies (Recommended)**
```bash
# Backup without node_modules
aws s3 sync ~/.openclaw/skills/ s3://bucket/skills/ \
  --exclude "*/node_modules/*"
```
**Pros:** Smaller, faster
**Cons:** Need to npm install on restore

**Option C: Smart Detection**
```bash
# Detect skill type and handle accordingly
for skill in ~/.openclaw/skills/*/; do
  if [[ -f "$skill/package.json" ]]; then
    # Has package.json - check if custom
    if ! skill_in_registry "$skill"; then
      # Custom skill - backup everything
      backup_skill "$skill"
    else
      # Registry skill - just note name/version
      echo "$skill_name@$version" >> installed-skills.txt
    fi
  fi
done
```
**Pros:** Optimal (only backup what's needed)
**Cons:** More complex logic

**Recommendation:** Use Option B (source only), reinstall deps on restore

---

### 4. SSH Keys & Credentials

**Location:** `~/.ssh/`

**Must backup:**
```
~/.ssh/
├── id_rsa                     # Private key for SSH to other instances
├── id_rsa.pub                 # Public key
├── bedrock-models-deploy      # Deploy key for GitHub (bedrock-models repo)
├── known_hosts                # Trusted hosts
└── config                     # SSH client config
```

**Security note:** These are sensitive! Encrypt backup or use AWS Secrets Manager.

**Why critical:**
- Can't SSH to dev instance without keys
- Can't push to GitHub without deploy keys
- Known hosts prevents security warnings

---

### 5. Git Configuration

**Location:** `~/.gitconfig`

**Must backup:**
```ini
[user]
    name = YourAgent and your-user
    email = noreply@github.com
[core]
    editor = nano
[credential]
    helper = cache --timeout=3600
```

**Why critical:**
- Commits need consistent author name
- Prevents "Who are you?" errors on git operations

---

### 6. Environment & Shell Configuration

**Location:** `~/`

**Must backup:**
```
~/.bashrc                      # Shell config, aliases
~/.bash_profile                # Login shell config
~/.profile                     # System profile
~/.nvm/                        # Node version manager (optional - can reinstall)
```

**Key environment variables to preserve:**
```bash
export AWS_REGION=us-west-2
export AWS_PROFILE=default
# Any custom PATH additions
# Any OpenClaw-specific vars
```

**Why critical:**
- AWS region setting
- Custom aliases or functions your-user might use
- NVM for Node.js version management

---

### 7. AWS Configuration (If Using)

**Location:** `~/.aws/`

**Usually NOT needed because:**
- EC2 instance uses IAM role (no credentials file needed)
- But backup if present:

```
~/.aws/
├── config                     # AWS CLI config (region, output format)
└── credentials                # Only if not using IAM role
```

**Why might be present:**
- If manually configured AWS CLI
- If using named profiles

---

### 8. System Packages & Dependencies

**Not files, but must document:**

**Node.js:**
```bash
node --version  # Currently v22.22.0
npm --version
```

**OpenClaw:**
```bash
openclaw --version  # Currently 2026.2.17
```

**System packages:**
```bash
# Document installed packages
dpkg -l | grep -E "(git|curl|wget|build-essential)" > packages.txt
```

**Why critical:**
- Need same Node.js version for compatibility
- Need same OpenClaw version
- Some skills might need system packages

---

## What's NOT Needed (Can Skip)

**Safe to exclude:**
- `/var/log/` (system logs)
- `/tmp/` (temporary files)
- `node_modules/` in skills (reinstall with `npm install`)
- `.git/` inside project directories (unless uncommitted work)
- Browser cache, download cache
- OpenClaw package cache

---

## Backup Strategy

### Option 1: Simple Tarball to S3

**Pros:** Simple, complete
**Cons:** Large, slow

```bash
# Create backup
tar -czf openclaw-aws-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  ~/.openclaw \
  ~/.openclaw/workspace \
  ~/.openclaw/skills \
  ~/.ssh \
  ~/.gitconfig \
  ~/.bashrc

# Upload to S3
aws s3 cp openclaw-aws-backup-*.tar.gz s3://my-backup-bucket/openclaw/
```

### Option 2: Selective Sync (Recommended)

**Pros:** Incremental, fast, efficient
**Cons:** Requires planning

```bash
# Sync critical directories
aws s3 sync ~/.openclaw s3://my-backup-bucket/openclaw/config/ \
  --exclude "logs/*" \
  --exclude "cache/*"

aws s3 sync ~/.openclaw/workspace s3://my-backup-bucket/openclaw/workspace/

aws s3 sync ~/.openclaw/skills s3://my-backup-bucket/openclaw/skills/ \
  --exclude "*/node_modules/*"
```

### Option 3: Automated Daily Backup

**Use OpenClaw cron job:**

```bash
# Schedule daily backup at 2 AM
openclaw cron add \
  --name "Daily OpenClaw Backup" \
  --schedule "0 2 * * *" \
  --session isolated \
  --payload-kind systemEvent \
  --message "Run backup script: /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/scripts/backup.sh"
```

---

## Restore Procedure

### Phase 1: New EC2 Instance Setup

1. **Launch instance:**
   - Same instance type (or larger)
   - Same AMI family (Ubuntu, Amazon Linux, etc.)
   - Same IAM role (BedrockDevRole or equivalent)
   - Same security groups

2. **Install base dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 22.22.0
nvm use 22.22.0

# Install OpenClaw
npm install -g openclaw

# Install git, other tools
sudo apt install -y git curl wget build-essential
```

### Phase 2: Restore Configuration

3. **Restore SSH keys:**
```bash
# Download from S3 or Secrets Manager
aws s3 cp s3://my-backup-bucket/openclaw/ssh/ ~/.ssh/ --recursive
chmod 600 ~/.ssh/id_rsa
chmod 600 ~/.ssh/bedrock-models-deploy
chmod 644 ~/.ssh/id_rsa.pub
chmod 644 ~/.ssh/config
```

4. **Restore git config:**
```bash
aws s3 cp s3://my-backup-bucket/openclaw/gitconfig ~/.gitconfig
```

5. **Restore OpenClaw config:**
```bash
# Stop gateway if running
openclaw gateway stop

# Restore config directory
aws s3 sync s3://my-backup-bucket/openclaw/config/ ~/.openclaw/

# Restore workspace
aws s3 sync s3://my-backup-bucket/openclaw/workspace/ ~/.openclaw/workspace/

# Restore skills
aws s3 sync s3://my-backup-bucket/openclaw/skills/ ~/.openclaw/skills/
```

### Phase 3: Reinstall Dependencies

6. **Reinstall skill dependencies:**
```bash
# For each skill directory
cd ~/.openclaw/skills/bedrock-models
npm install

cd ~/.openclaw/workspace/skills/s3-files
npm install
```

7. **Verify installation:**
```bash
openclaw status
openclaw cron list
openclaw-bedrock-models status
```

### Phase 4: Start Gateway

8. **Start OpenClaw:**
```bash
openclaw gateway start

# Or as daemon
openclaw gateway start --daemon
```

9. **Test conversation:**
```
# Send test message via Telegram
# YourAgent should respond with full context
# Should remember previous conversations
```

---

## Validation Checklist

**After restore, verify:**

- [ ] OpenClaw gateway running
- [ ] Can send/receive Telegram messages
- [ ] Conversation history intact (ask about recent project)
- [ ] Memory files loaded (I remember past conversations)
- [ ] Projects accessible (can list active projects)
- [ ] Skills working (bedrock-models commands work)
- [ ] Cron jobs scheduled (daily stock report exists)
- [ ] SSH keys working (can connect to dev instance)
- [ ] Git config correct (commits show "YourAgent and your-user")

**Test conversation:**
```
your-user: "What projects are we working on?"
YourAgent: Should list all active projects from PROJECTS.md

your-user: "What did we work on yesterday?"
YourAgent: Should reference memory/2026-02-18.md

your-user: "Check bedrock models status"
YourAgent: Should run openclaw-bedrock-models status
```

---

## Security Considerations

### Sensitive Data in Backup

**What's sensitive:**
- SSH private keys (`~/.ssh/id_rsa`, deploy keys)
- AWS credentials (if in `~/.aws/credentials`)
- Session tokens (in `sessions.json`)
- Channel tokens (Telegram bot token in `channels/telegram/`)

**Protection options:**

1. **Encrypt backup:**
```bash
# Encrypt before upload
gpg --encrypt --recipient gene@example.com openclaw-aws-backup.tar.gz
aws s3 cp openclaw-aws-backup.tar.gz.gpg s3://bucket/
```

2. **AWS Secrets Manager:**
```bash
# Store SSH keys in Secrets Manager
aws secretsmanager create-secret \
  --name openclaw/ssh-keys \
  --secret-string file://~/.ssh/id_rsa

# Restore from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id openclaw/ssh-keys \
  --query SecretString \
  --output text > ~/.ssh/id_rsa
```

3. **S3 Encryption:**
```bash
# Server-side encryption
aws s3 cp backup.tar.gz s3://bucket/ --sse AES256
```

4. **Separate sensitive files:**
```bash
# Backup sensitive files separately with encryption
tar -czf sensitive.tar.gz ~/.ssh ~/.openclaw/channels
gpg --encrypt sensitive.tar.gz

# Backup non-sensitive freely
aws s3 sync ~/.openclaw/workspace s3://bucket/workspace/
```

---

## Automation Script Structure

**Create:** `scripts/backup.sh`

```bash
#!/bin/bash
# OpenClaw Backup Script

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_BUCKET="s3://your-backup-bucket/openclaw-aws-backups"
BACKUP_DIR="/tmp/openclaw-aws-backup-$TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Copy critical files
cp -r ~/.openclaw "$BACKUP_DIR/"
cp -r ~/.openclaw/workspace "$BACKUP_DIR/"
cp -r ~/.openclaw/skills "$BACKUP_DIR/"
cp ~/.gitconfig "$BACKUP_DIR/"
cp ~/.bashrc "$BACKUP_DIR/"

# SSH keys (sensitive - handle separately)
mkdir -p "$BACKUP_DIR/ssh"
cp ~/.ssh/id_rsa.pub "$BACKUP_DIR/ssh/"
cp ~/.ssh/config "$BACKUP_DIR/ssh/"
# Private keys -> encrypt or use Secrets Manager

# Create tarball
cd /tmp
tar -czf "openclaw-aws-backup-$TIMESTAMP.tar.gz" "openclaw-aws-backup-$TIMESTAMP"

# Upload to S3
aws s3 cp "openclaw-aws-backup-$TIMESTAMP.tar.gz" "$BACKUP_BUCKET/"

# Cleanup
rm -rf "$BACKUP_DIR"
rm "openclaw-aws-backup-$TIMESTAMP.tar.gz"

echo "Backup complete: $BACKUP_BUCKET/openclaw-aws-backup-$TIMESTAMP.tar.gz"
```

**Create:** `scripts/restore.sh`

```bash
#!/bin/bash
# OpenClaw Restore Script

BACKUP_BUCKET="s3://your-backup-bucket/openclaw-aws-backups"
LATEST_BACKUP=$(aws s3 ls "$BACKUP_BUCKET/" | sort | tail -n 1 | awk '{print $4}')

echo "Restoring from: $LATEST_BACKUP"

# Download backup
aws s3 cp "$BACKUP_BUCKET/$LATEST_BACKUP" /tmp/

# Extract
cd /tmp
tar -xzf "$LATEST_BACKUP"

# Restore files
cp -r openclaw-aws-backup-*/openclaw/* ~/.openclaw/
cp -r openclaw-aws-backup-*/workspace/* ~/.openclaw/workspace/
cp -r openclaw-aws-backup-*/skills/* ~/.openclaw/skills/
cp openclaw-aws-backup-*/.gitconfig ~/.gitconfig
cp openclaw-aws-backup-*/.bashrc ~/.bashrc

# SSH keys (restore from Secrets Manager or separate secure backup)
# aws secretsmanager get-secret-value ... > ~/.ssh/id_rsa
# chmod 600 ~/.ssh/id_rsa

# Reinstall skill dependencies
for skill in ~/.openclaw/skills/*/; do
  if [ -f "$skill/package.json" ]; then
    echo "Installing dependencies for $(basename $skill)"
    cd "$skill"
    npm install
  fi
done

echo "Restore complete. Start OpenClaw with: openclaw gateway start"
```

---

## Testing Backup/Restore

**Test plan:**

1. **Create backup on current instance**
2. **Launch new test EC2 instance**
3. **Run restore script**
4. **Verify checklist (above)**
5. **Send test message**
6. **Confirm I remember context**

**If successful:**
- Terminate test instance
- Keep backup script in production
- Schedule daily automated backups

---

## Deliverables for This Project

1. ✅ **This document** - Comprehensive backup list
2. [ ] `scripts/backup.sh` - Automated backup script
3. [ ] `scripts/restore.sh` - Automated restore script
4. [ ] `scripts/test-restore.sh` - Validation script
5. [ ] `docs/BACKUP-PROCEDURE.md` - Step-by-step guide
6. [ ] `docs/RESTORE-PROCEDURE.md` - Emergency restore guide
7. [ ] Cron job configured for daily backups

---

## Next Steps

1. Review this list with your-user
2. Implement backup script
3. Test backup/restore on dev instance
4. Set up automated daily backups
5. Document emergency restore procedure
6. Store backup location securely

---

**Goal:** If this EC2 instance explodes, your-user can spin up a new one and we pick up exactly where we left off.
