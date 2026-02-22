# OpenClaw AWS Backup Skill

Secure AWS backup and restore for OpenClaw with KMS encryption, IAM isolation, and automated scheduling.

## Features

- 🔒 **KMS Encryption** - All backups encrypted at rest with AWS KMS
- ☁️ **S3 Storage** - Reliable cloud storage with versioning
- 🔄 **Automated Backups** - Cron-based scheduling (6h/daily/weekly/custom)
- 🛡️ **Memory Protection** - Swap + systemd limits to prevent OOM
- 🧹 **Retention Management** - Automatic cleanup of old backups
- 🧪 **Test Suite** - Comprehensive testing before production use

## Installation

```bash
cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill
npm install
sudo npm link  # Makes 'openclaw-aws-backup' available globally
```

## Quick Start

### 1. Setup

Run the interactive setup wizard:

```bash
openclaw-aws-backup setup
```

This will:
- Detect your instance ID and region
- Configure backup frequency
- Create KMS encryption key
- Setup S3 bucket with versioning
- Configure memory protection
- Setup automated cron jobs

### 2. Create Backup

```bash
openclaw-aws-backup create
```

### 3. List Backups

```bash
openclaw-aws-backup list
```

### 4. Restore

```bash
openclaw-aws-backup restore
```

Interactive menu will let you choose which backup to restore.

### 5. Test

```bash
openclaw-aws-backup test
```

Run comprehensive test suite to verify everything works.

## Configuration

Configuration is stored in `config/backup-config.json`:

```json
{
  "instanceId": "i-xxxxx",
  "region": "us-west-2",
  "backupFrequency": "daily",
  "s3": {
    "bucket": "openclaw-aws-backups",
    "prefix": "openclaw-aws-backups/instance-i-xxxxx"
  },
  "encryption": {
    "enabled": true,
    "method": "kms",
    "kmsKeyAlias": "alias/openclaw-aws-backup-i-xxxxx",
    "gpgRecipient": null
  },
  "memoryProtection": {
    "enabled": true,
    "swap": "2G",
    "memoryMax": "1200M",
    "memoryHigh": "1000M"
  },
  "retention": {
    "keep": 30,
    "autoClean": true
  }
}
```

## Encryption Options

### KMS Encryption (Recommended)
**When to use:**
- Production environments
- Compliance requirements
- Multi-instance deployments
- Automated key rotation needed

**Features:**
- AWS-native encryption
- IAM-controlled access
- Automatic key rotation
- Encryption/decryption handled by AWS
- No manual key management

**Setup:**
Choose "Yes" → "KMS" during setup. The wizard will create the KMS key automatically.

### GPG Encryption
**When to use:**
- Hybrid/multi-cloud deployments
- Air-gapped backups
- Portable encryption across providers
- Manual key control required

**Features:**
- Portable (works outside AWS)
- Manual key management
- Client-side encryption before upload
- Works with any S3-compatible storage

**Setup:**
Choose "Yes" → "GPG" during setup. Requires GPG to be installed (`sudo apt install gnupg`).

### No Encryption
**When to use:**
- Local/dev testing only
- Trusted S3 buckets with server-side encryption enabled
- Non-production environments
- When simplicity outweighs security

**Setup:**
Choose "No" when asked "Enable encryption?" during setup.

**Security note:** S3 bucket should have default encryption at rest enabled for baseline security. Not recommended for production use.

## Backup Scope

The backup includes:
- `~/.openclaw/` - All OpenClaw configuration
- `~/.openclaw/workspace/` - Your workspace files
- All agent state and memory files
- Skill configurations

## Cron Integration

For automated backups, integrate with OpenClaw's cron system:

```bash
# Read cron config generated during setup
cat config/cron-config.json

# Add to OpenClaw cron using the 'cron' tool
# Example: cron add --text "OpenClaw backup" --mode daily --command "node /path/to/backup-create.js"
```

## Security

### Encryption at Rest
- **KMS mode** (recommended): All backups encrypted with AWS KMS (AES-256)
- **GPG mode**: Client-side encryption with RSA-2048 before upload
- **No encryption mode**: Relies on S3 bucket default encryption (dev/testing only)

### Encryption in Transit
- HTTPS for all S3 uploads (enforced by AWS SDK)

### Access Control
- **IAM isolation**: Separate KMS key per instance (KMS mode)
- **S3 bucket policies**: Restrict access by instance role
- **GPG keys**: Local keypair, exportable for portability

### Key Management
- **KMS**: Automatic key rotation, AWS-managed
- **GPG**: Manual key management, backup your private key
- **No encryption**: No key management required

## Memory Protection

**Recommended for small EC2 instances** (tested on t3.micro/t3.small with 2GB RAM)

If enabled during setup, the skill configures:

1. **Swap file**: 2GB swap space for emergency memory
2. **Systemd limits**: Memory limits prevent runaway processes
   - `MemoryMax=1200M` - Hard limit
   - `MemoryHigh=1000M` - Soft limit with throttling

**When to enable:**
- EC2 instances with ≤2GB RAM (t3.micro, t3.small, t4g.micro, etc.)
- Prevents backup process from OOM-killing the instance
- Tested and validated on 2GB RAM instances

**When to skip:**
- Instances with ≥4GB RAM (t3.medium and larger)
- Memory protection adds minimal overhead but unnecessary on larger instances

## Troubleshooting

### Backup fails with "KMS key not found"

Run setup again and choose to create KMS key:
```bash
openclaw-aws-backup setup
```

### S3 upload fails with permission error

Verify IAM permissions:
```bash
aws s3 ls s3://your-bucket-name
aws kms describe-key --key-id alias/openclaw-aws-backup-YOUR_INSTANCE
```

### Restore doesn't work

1. Check you have backups: `openclaw-aws-backup list`
2. Run test suite: `openclaw-aws-backup test`
3. Verify AWS credentials are working

## Architecture

```
┌─────────────────────────────────────────────┐
│           OpenClaw Instance                  │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │   Backup Creation                   │    │
│  │   - Tar workspace                   │    │
│  │   - Compress                        │    │
│  └────────────┬────────────────────────┘    │
│               │                              │
│               ▼                              │
│  ┌────────────────────────────────────┐    │
│  │   S3 Upload (AWS SDK)              │    │
│  │   - KMS encryption                  │    │
│  │   - Metadata tagging                │    │
│  └────────────┬────────────────────────┘    │
└───────────────┼──────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│              AWS Cloud                       │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │   S3 Bucket                         │    │
│  │   - Versioning enabled              │    │
│  │   - Lifecycle policies              │    │
│  │   - Encrypted with KMS              │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │   KMS Key                           │    │
│  │   - Instance-specific               │    │
│  │   - Managed encryption              │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `openclaw-aws-backup setup` | Run interactive setup wizard |
| `openclaw-aws-backup create` | Create new backup |
| `openclaw-aws-backup restore` | Restore from backup (interactive) |
| `openclaw-aws-backup list` | List available backups |
| `openclaw-aws-backup test` | Run test suite |

## License

Part of the OpenClaw ecosystem.

---

*Maintained by the OpenClaw community*
