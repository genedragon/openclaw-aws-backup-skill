# OpenClaw Backup Skill - Framework Integration Guide

**Status:** Phase 2 Complete - Ready for Integration  
**Date:** 2026-02-20

---

## Integration with Agentic Framework

This document describes how the **OpenClaw Backup Skill** integrates with the **Agentic Framework** for multi-agent state management.

See also: `/home/ubuntu/.openclaw/workspace/agentic-framework/BACKUP-INTEGRATION.md`

---

## Quick Integration for Long-Running Agents

All long-running agents (especially managers and workers with state) should configure backup during bootstrap.

### During Agent Setup

**1. Install backup skill:**
```bash
cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill
npm install
sudo npm link  # Makes 'openclaw-aws-backup' available globally
```

**2. Run setup wizard:**
```bash
openclaw-aws-backup setup
```

**3. Configure backup frequency based on agent role:**

| Agent Type | Recommended Frequency | Reason |
|------------|----------------------|---------|
| Manager | Daily (midnight) | Critical orchestration state |
| Librarian | Daily (midnight) | Knowledge repository changes frequently |
| Worker (stateful) | Weekly | Task state persists between sessions |
| Worker (ephemeral) | Manual only | State is transient |
| Access Service | Weekly | Minimal state, low change rate |

---

## Bootstrap Integration Example

### Manager Agent Bootstrap

```javascript
// During manager agent bootstrap
async function bootstrapManager(config) {
  // ... other bootstrap tasks
  
  // Configure backup
  if (config.enableBackup !== false) {
    console.log('Configuring backup for manager agent...');
    
    // Check if backup is already configured
    const backupConfigPath = '/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backup-config.json';
    
    if (!fs.existsSync(backupConfigPath)) {
      // First time - run setup
      await exec('openclaw-aws-backup setup');
      // User will be prompted for backup frequency
      // Manager agents should choose: "Daily (midnight)"
    } else {
      console.log('✓ Backup already configured');
    }
    
    // Test backup system
    console.log('Testing backup system...');
    await exec('openclaw-aws-backup test');
    console.log('✓ Backup system ready');
  }
}
```

### Worker Agent Bootstrap (Stateful)

```javascript
// During worker agent bootstrap
async function bootstrapWorker(config) {
  // ... other bootstrap tasks
  
  if (config.isStateful && config.enableBackup) {
    console.log('Configuring backup for stateful worker...');
    
    const backupConfigPath = '/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backup-config.json';
    
    if (!fs.existsSync(backupConfigPath)) {
      await exec('openclaw-aws-backup setup');
      // Worker agents should choose: "Weekly (Sunday midnight)"
    } else {
      console.log('✓ Backup already configured');
    }
  }
}
```

### Librarian Agent Bootstrap

```javascript
// During librarian agent bootstrap
async function bootstrapLibrarian(config) {
  // ... other bootstrap tasks
  
  // Librarian manages knowledge base - critical to backup daily
  console.log('Configuring backup for librarian agent...');
  
  const backupConfigPath = '/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backup-config.json';
  
  if (!fs.existsSync(backupConfigPath)) {
    await exec('openclaw-aws-backup setup');
    // Librarian should choose: "Daily (midnight)"
  }
  
  // Librarian should also backup after major knowledge base updates
  // Register backup hook
  knowledgeBase.on('majorUpdate', async () => {
    console.log('Major knowledge base update - creating backup...');
    await exec('openclaw-aws-backup create');
  });
}
```

---

## Backup Scope by Agent Type

### Manager Agent Backup Scope

**What to backup:**
- Full OpenClaw state (`~/.openclaw/`)
- Workspace with agent registry
- Task queue and orchestration state
- Agent spawn history
- Current project state

**Frequency:** Daily

**Restoration priority:** CRITICAL (manager must restore first)

### Librarian Agent Backup Scope

**What to backup:**
- Full OpenClaw state
- Knowledge base index
- Context packages (cached)
- Usage logs
- Optimization rules

**Frequency:** Daily (or after major updates)

**Restoration priority:** HIGH (needed for context)

### Worker Agent Backup Scope (Stateful)

**What to backup:**
- Task assignment state
- Execution context
- Partial results/artifacts
- Loaded context snapshot

**Frequency:** Weekly (or manual)

**Restoration priority:** MEDIUM (can resume work)

### Access Service Backup Scope

**What to backup:**
- Token registry (active + revoked)
- Security policies
- Approval logs
- Privilege grants

**Frequency:** Weekly

**Restoration priority:** HIGH (security state)

---

## Multi-Agent Backup Coordination

The framework should coordinate backups across multiple agents to ensure consistency.

### Backup Manifest (Framework Level)

```json
{
  "backup_id": "agentic-framework-20260220-120000",
  "project": "my-project",
  "timestamp": "2026-02-20T12:00:00Z",
  "backup_type": "multi-agent",
  "agents": [
    {
      "id": "manager-1",
      "type": "manager",
      "backup_path": "s3://openclaw-aws-backups/instance-i-abc123/openclaw-aws-backup-2026-02-20T12-00-00.tar.gz",
      "state_snapshot": "manager-state-2026-02-20.json"
    },
    {
      "id": "worker-1", 
      "type": "code-writer",
      "backup_path": "s3://openclaw-aws-backups/instance-i-def456/openclaw-aws-backup-2026-02-20T12-00-00.tar.gz",
      "state_snapshot": "worker-1-state-2026-02-20.json"
    }
  ],
  "coordination": {
    "manager_id": "manager-1",
    "initiated_by": "manager-1",
    "completion_time": "2026-02-20T12:05:23Z"
  }
}
```

### Coordinated Backup Flow

```
Manager Agent
    │
    ├─→ Backup self first
    │
    ├─→ Signal workers to backup
    │       │
    │       ├─→ Worker 1: openclaw-aws-backup create
    │       ├─→ Worker 2: openclaw-aws-backup create
    │       └─→ Librarian: openclaw-aws-backup create
    │
    └─→ your-userrate manifest (links all backups)
```

### Coordinated Restore Flow

```
User: Restore from backup-id

    ↓
    
Load manifest

    ↓
    
Restore manager FIRST
    │
    └─→ Manager coordinates worker restore
            │
            ├─→ Restore librarian
            ├─→ Restore access service
            └─→ Restore workers (parallel)
```

---

## Cron Integration

### Manual Cron Setup (Current)

After running `openclaw-aws-backup setup`, integrate with OpenClaw cron:

```bash
# View generated cron config
cat /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/cron-config.json

# Example output:
# {
#   "schedule": "0 0 * * *",
#   "command": "node /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/bin/backup-create.js",
#   "description": "OpenClaw automated backup"
# }

# Add to OpenClaw cron manually
cron add \
  --text "OpenClaw daily backup" \
  --mode daily \
  --command "cd /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill && node bin/backup-create.js"
```

### Future: Auto-Install Cron (Framework Level)

```javascript
// Framework should auto-install cron during bootstrap
async function installBackupCron(agent) {
  const cronConfig = JSON.parse(
    fs.readFileSync('/home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/cron-config.json')
  );
  
  await exec(`cron add --text "${cronConfig.description}" --mode custom --schedule "${cronConfig.schedule}" --command "${cronConfig.command}"`);
  
  console.log('✓ Backup cron job installed');
}
```

---

## State Serialization Interface

### Agent State Serialization (Future Framework Feature)

Each agent type should implement:

```typescript
interface AgentState {
  /**
   * Serialize agent state for backup
   */
  serialize(): BackupData;
  
  /**
   * Restore agent state from backup
   */
  deserialize(data: BackupData): void;
  
  /**
   * Validate restored state
   */
  validate(): boolean;
}
```

### Example: Manager State Serialization

```typescript
class ManagerAgent implements AgentState {
  serialize() {
    return {
      type: 'manager',
      version: '1.0',
      project: this.currentProject,
      taskQueue: this.tasks.map(t => t.serialize()),
      spawnedAgents: this.agentRegistry.map(a => ({
        id: a.id,
        type: a.type,
        status: a.status,
        spawnTime: a.spawnTime
      })),
      orchestrationState: {
        currentPhase: this.phase,
        completedTasks: this.completedTasks,
        pendingApprovals: this.pendingApprovals
      },
      timestamp: Date.now()
    };
  }
  
  deserialize(data: BackupData) {
    this.currentProject = data.project;
    this.tasks = data.taskQueue.map(t => Task.deserialize(t));
    this.agentRegistry = data.spawnedAgents;
    this.phase = data.orchestrationState.currentPhase;
    this.completedTasks = data.orchestrationState.completedTasks;
    this.pendingApprovals = data.orchestrationState.pendingApprovals;
  }
  
  validate(): boolean {
    return (
      this.currentProject != null &&
      Array.isArray(this.tasks) &&
      Array.isArray(this.agentRegistry)
    );
  }
}
```

---

## Testing Multi-Agent Backup

### Test Scenario 1: Manager + Worker Backup

```bash
# 1. Setup manager instance
openclaw-aws-backup setup  # Choose "daily"

# 2. Setup worker instance (different instance)
openclaw-aws-backup setup  # Choose "weekly"

# 3. Create coordinated backup
# Manager triggers backup
openclaw-aws-backup create  # Manager backup

# Workers backup separately
openclaw-aws-backup create  # Worker 1
openclaw-aws-backup create  # Worker 2

# 4. List all backups
openclaw-aws-backup list
```

### Test Scenario 2: Restore Manager Only

```bash
# 1. Simulate manager crash
# (manager instance goes down)

# 2. Restore manager
openclaw-aws-backup restore
# Choose most recent manager backup

# 3. Manager resumes orchestration
# Workers still running, manager reconnects
```

### Test Scenario 3: Nuclear Wipe & Full Restore

```bash
# 1. Create full backup
openclaw-aws-backup create  # All agents

# 2. Nuclear wipe
rm -rf ~/.openclaw

# 3. Restore
openclaw-aws-backup restore

# 4. Verify
openclaw-aws-backup test
```

---

## Best Practices

### 1. Always Test Restore Before Relying on Backups

```bash
# After initial setup
openclaw-aws-backup create
openclaw-aws-backup test
```

### 2. Backup Before Risky Operations

```bash
# Before nuclear wipe
openclaw-aws-backup create

# Before major upgrade
openclaw-aws-backup create

# Before system changes
openclaw-aws-backup create
```

### 3. Monitor Backup Success

```bash
# Check recent backups
openclaw-aws-backup list

# Verify backup metadata
cat /home/ubuntu/.openclaw/workspace/openclaw-aws-backup-skill/config/backups/*.json
```

### 4. Test Restore Periodically

```bash
# Monthly restore test (non-production)
openclaw-aws-backup test
```

### 5. Use Separate Buckets per Environment

```bash
# Production
S3_BUCKET=openclaw-aws-backups-prod openclaw-aws-backup setup

# Development
S3_BUCKET=openclaw-aws-backups-dev openclaw-aws-backup setup

# Staging
S3_BUCKET=openclaw-aws-backups-staging openclaw-aws-backup setup
```

---

## Troubleshooting

### Problem: Backup fails during cron job

**Solution:**
```bash
# Check cron logs
journalctl -u cron -f

# Test backup manually
openclaw-aws-backup create

# Run test suite
openclaw-aws-backup test
```

### Problem: Restore doesn't resume agent state

**Solution:**
- Ensure agent implements state serialization
- Verify state files in backup: `tar -tzf backup.tar.gz | grep state`
- Check agent logs after restore

### Problem: Multi-agent restore coordination fails

**Solution:**
- Restore manager FIRST, always
- Manager coordinates other restores
- Use backup manifest to track dependencies

---

## Future Enhancements

### 1. Framework-Aware Backup

```javascript
// Framework coordinates backup across agents
await framework.backup({
  strategy: 'all',
  waitForCompletion: true
});
```

### 2. Incremental Backups

```javascript
// Only backup changed state
await framework.backup({
  strategy: 'incremental',
  since: lastBackupTimestamp
});
```

### 3. Cross-Region Replication

```javascript
// Replicate backups to multiple regions
await framework.backup({
  replication: ['us-west-2', 'eu-west-1']
});
```

### 4. Backup Verification

```javascript
// Verify backup integrity
await framework.backup({
  verify: true,
  checksumAlgorithm: 'sha256'
});
```

---

## Summary

**Phase 2 Complete:**
- ✅ Setup wizard with interactive configuration
- ✅ Backup creation with KMS encryption
- ✅ Restore with interactive selection
- ✅ Automated cleanup (retention management)
- ✅ Memory protection (swap + systemd limits)
- ✅ Test suite for verification
- ✅ Framework integration documentation

**Ready for:**
- Manager agent bootstrap integration
- Worker agent backup configuration
- Multi-agent backup coordination (future phase)

**Integration Points:**
1. Bootstrap: Call `openclaw-aws-backup setup` during agent initialization
2. Cron: Install backup cron job based on agent role
3. State: Implement serialize/deserialize for agent state (future)
4. Coordination: Manager coordinates multi-agent backups (future)

**Documentation:**
- README.md - User guide
- SKILL.md - Skill reference
- This file - Framework integration
- `/agentic-framework/BACKUP-INTEGRATION.md` - Architecture design
