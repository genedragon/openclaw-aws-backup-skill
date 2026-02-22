---
name: openclaw-aws-backup
description: "Secure backup and restore for OpenClaw instances with S3 storage and optional KMS encryption. Use when: backing up before upgrades, disaster recovery, instance migration, or automated scheduled backups. Supports local and cloud storage with retention policies."
homepage: https://github.com/genedragon/openclaw-aws-backup-skill
metadata: { "openclaw": { "emoji": "💾", "requires": { "bins": ["openclaw-aws-backup", "tar", "aws"] } } }
---

# OpenClaw Backup Skill

Secure backup and restore for OpenClaw with encryption and IAM isolation.

## What This Skill Does

Creates encrypted backups of your OpenClaw instance and stores them in S3 with KMS encryption. Supports automated scheduling and easy restoration.

## Quick Commands

```bash
# First-time setup
openclaw-aws-backup setup

# Create backup
openclaw-aws-backup create

# List backups
openclaw-aws-backup list

# Restore from backup
openclaw-aws-backup restore

# Test everything
openclaw-aws-backup test
```

## When to Use

- **Before major upgrades** - Backup before updating OpenClaw
- **Before risky operations** - Nuclear wipe, system changes
- **Automated daily/weekly** - Set it and forget it
- **Disaster recovery** - Restore after data loss
- **Migration** - Move to new instance

## What Gets Backed Up

- All OpenClaw configuration (`~/.openclaw/`)
- Workspace files and agent memory
- Skills and custom tools
- Agent state and context

## Security Features

- **KMS encryption** - Data encrypted at rest
- **IAM isolation** - Separate key per instance
- **S3 versioning** - Keep multiple versions
- **Automatic retention** - Old backups auto-deleted

## Memory Protection

Optional feature to prevent OOM:
- 2GB swap file
- Systemd memory limits (1200M max)
- Prevents backup process from crashing instance

## Integration with Agentic Framework

For long-running agents, configure backup during bootstrap:

```javascript
// Manager agents: Daily backups
if (agent.role === 'manager') {
  await exec('openclaw-aws-backup setup');
  // Choose "daily" in wizard
}

// Worker agents: Weekly or manual
if (agent.role === 'worker') {
  await exec('openclaw-aws-backup setup');
  // Choose "weekly" or "manual"
}
```

## Backup Frequency Recommendations

| Agent Type | Frequency | Reason |
|------------|-----------|--------|
| Manager | Daily | Critical orchestration state |
| Librarian | Daily | Knowledge repository changes |
| Worker | Weekly | Transient task state |
| Access Service | Manual | Minimal state |
| Development | Manual | Frequent changes, manual control |

## Technical Details

- **Storage**: S3 with versioning
- **Encryption**: KMS server-side encryption
- **Format**: tar.gz
- **Retention**: Configurable (default: 30 backups)
- **Cleanup**: Automatic old backup deletion

## Restoration Process

1. List available backups
2. Choose backup to restore
3. Current config backed up to `.openclaw.pre-restore-*`
4. Backup downloaded and extracted
5. Files restored to `~/.openclaw/`
6. Restart OpenClaw

## Cron Integration

The skill generates cron config but doesn't auto-install. Manual integration:

```bash
# View generated cron config
cat /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/cron-config.json

# Integrate with OpenClaw cron
cron add --text "OpenClaw daily backup" \
  --mode daily \
  --command "cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill && node bin/backup-create.js"
```

## Troubleshooting

**"No configuration found"**  
→ Run `openclaw-aws-backup setup` first

**"KMS key not accessible"**  
→ Check IAM permissions or recreate key in setup

**"S3 bucket does not exist"**  
→ Run setup again, it will create the bucket

**Backup too large**  
→ Clean workspace before backup, or increase retention to reduce frequency

## Testing Before Production

Always run the test suite before relying on backups:

```bash
openclaw-aws-backup test
```

Tests verify:
1. Configuration validity
2. S3 connectivity
3. KMS key access
4. Backup creation with encryption
5. List functionality
6. Restore prerequisites

## Best Practices

1. **Test restores regularly** - Backups are useless if restore doesn't work
2. **Monitor backup size** - Large workspaces = large backups
3. **Use separate buckets per environment** - prod/dev/staging
4. **Enable S3 versioning** - Extra protection
5. **Rotate KMS keys annually** - Security hygiene
6. **Keep 30 days retention minimum** - Balance cost vs. recovery window

## Cost Considerations

- **S3 storage**: ~$0.023/GB/month (Standard)
- **KMS key**: $1/month + $0.03/10k requests
- **Data transfer**: Free for same-region

Example: 1GB daily backup, 30-day retention = ~$0.70/month

## File Locations

```
openclaw-aws-backup-skill/
├── bin/
│   ├── openclaw-aws-backup.js      # Main CLI entrypoint
│   ├── setup.js                # Interactive setup wizard
│   ├── backup-create.js        # Create backup
│   ├── backup-restore.js       # Restore backup
│   ├── backup-list.js          # List backups
│   └── backup-test.js          # Test suite
├── config/
│   ├── backup-config.json      # Configuration
│   ├── cron-config.json        # Cron integration config
│   └── backups/                # Backup metadata
├── lib/                        # Shared utilities
├── templates/                  # Config templates
├── package.json
├── README.md
└── SKILL.md
```

## Future Enhancements

- [ ] Incremental backups (rsync-style)
- [ ] Multi-region replication
- [ ] Backup verification (checksum validation)
- [ ] Slack/email notifications on backup failure
- [ ] Backup encryption with customer-managed keys
- [ ] Selective restore (restore only workspace, not config)
- [ ] Compression level configuration
- [ ] Backup performance metrics

## Support

For issues or questions:
1. Check README.md for detailed docs
2. Run test suite to diagnose problems
3. Check CloudWatch logs for S3/KMS errors
4. Verify IAM permissions for S3 and KMS
