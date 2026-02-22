# OpenClaw Backup Skill - Quick Start

## Installation (5 seconds)

```bash
cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill
npm install
npm link  # Makes 'openclaw-aws-backup' globally available
```

## First Use (2 minutes)

### 1. Run Setup

```bash
openclaw-aws-backup setup
```

**Answer the questions:**
- Backup frequency: `Daily (midnight)` for managers, `Weekly` for workers
- S3 bucket: `openclaw-aws-backups` (or your custom bucket)
- Create KMS key: `Yes`
- Memory protection: `Yes`

**What it does:**
- Detects your instance ID and region automatically
- Creates KMS encryption key
- Configures S3 bucket with versioning
- Sets up memory protection (swap + limits)
- your-userrates cron config (manual install)

### 2. Test Everything

```bash
openclaw-aws-backup test
```

**What it tests:**
- Configuration validity
- S3 connectivity
- KMS key access
- Backup creation (creates real test backup)
- List functionality
- Restore prerequisites

### 3. Create Your First Backup

```bash
openclaw-aws-backup create
```

**What happens:**
- Creates tarball of `~/.openclaw/` and workspace
- Uploads to S3 with KMS encryption
- Cleans up local files
- Records metadata

### 4. List Backups

```bash
openclaw-aws-backup list
```

**Output example:**
```
📋 OpenClaw Backup - Available Backups

S3 Location: s3://openclaw-aws-backups/openclaw-aws-backups/instance-i-abc123/

Backup Name                                      Date                     Size
--------------------------------------------------------------------------------
openclaw-aws-backup-2026-02-20T23-30-00              2026-02-20 23:30:00      15.23 MB

Total: 1 backup(s)
Retention: Keep last 30 backups
```

### 5. Restore (When Needed)

```bash
openclaw-aws-backup restore
```

**Interactive menu:**
- Shows all available backups
- Choose which to restore
- Confirms before overwriting
- Backs up current config to `.openclaw.pre-restore-*`
- Downloads and extracts
- Restores files

---

## Daily Workflow

### Automated (Recommended)

After setup, backups run automatically via cron. Check periodically:

```bash
openclaw-aws-backup list  # See recent backups
```

### Manual

Before risky operations:

```bash
openclaw-aws-backup create  # Create backup
# ... do risky thing ...
openclaw-aws-backup restore  # Restore if needed
```

---

## Integration with Agents

### Manager Agent Bootstrap

```javascript
// During manager bootstrap
const backupConfigured = fs.existsSync(
  '/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backup-config.json'
);

if (!backupConfigured) {
  console.log('🔒 Configuring backup system...');
  await exec('openclaw-aws-backup setup');
  // User prompted: choose "Daily (midnight)"
  console.log('✅ Backup configured');
}

// Test backup
await exec('openclaw-aws-backup test');
console.log('✅ Backup system verified');
```

### Worker Agent Bootstrap

```javascript
// During worker bootstrap (stateful workers only)
if (worker.isStateful) {
  const backupConfigured = fs.existsSync(
    '/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backup-config.json'
  );
  
  if (!backupConfigured) {
    console.log('🔒 Configuring backup for stateful worker...');
    await exec('openclaw-aws-backup setup');
    // User prompted: choose "Weekly (Sunday midnight)"
    console.log('✅ Backup configured');
  }
}
```

---

## Cron Setup (Manual)

After `openclaw-aws-backup setup`, integrate with OpenClaw cron:

```bash
# View generated cron config
cat /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/cron-config.json

# Install cron job
cron add \
  --text "OpenClaw daily backup" \
  --mode daily \
  --command "cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill && node bin/backup-create.js"
```

---

## Common Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `openclaw-aws-backup setup` | Initial configuration | First time, or reconfigure |
| `openclaw-aws-backup create` | Manual backup | Before risky operations |
| `openclaw-aws-backup restore` | Restore from backup | After data loss or rollback |
| `openclaw-aws-backup list` | Show available backups | Check backup history |
| `openclaw-aws-backup test` | Verify system works | After setup, monthly checks |

---

## Troubleshooting

### "No configuration found"

```bash
openclaw-aws-backup setup
```

### Backup fails

```bash
# Run diagnostics
openclaw-aws-backup test

# Check AWS credentials
aws sts get-caller-identity
```

### Restore doesn't work

```bash
# Verify backups exist
openclaw-aws-backup list

# Check S3 access
aws s3 ls s3://your-bucket-name
```

---

## What Gets Backed Up

✅ **Included:**
- `~/.openclaw/` - All OpenClaw config
- `~/.openclaw/workspace/` - Workspace files
- Agent state and memory
- Skills and tools

❌ **Not Included:**
- Node modules (regenerated)
- Temporary files
- Log files (unless in workspace)

---

## Security

- 🔒 **Encryption at rest:** KMS encryption for all backups
- 🔒 **Encryption in transit:** HTTPS for S3 uploads
- 🔒 **IAM isolation:** Separate KMS key per instance
- 🔒 **Access control:** S3 bucket policies
- 🔒 **Versioning:** S3 versioning for multiple copies

---

## Next Steps

1. ✅ Run `openclaw-aws-backup setup`
2. ✅ Run `openclaw-aws-backup test`
3. ✅ Create first backup: `openclaw-aws-backup create`
4. ✅ Verify: `openclaw-aws-backup list`
5. ✅ Install cron job (see Cron Setup above)
6. ✅ Test restore in dev environment

**Questions?** See README.md for full documentation.
