# Disaster Recovery Testing - DR Test Command

**Part of:** OpenClaw Backup to S3 Skill

---

## Purpose

Allow agent to test its own backup/restore OR test another agent's backup/restore without destroying the live system.

---

## Use Cases

### Use Case 1: Self-Test (Agent tests own backup)

```bash
# Agent tests its own backup/restore
openclaw-aws-backup dr-test

# Or via conversation
your-user: "Run a DR test"
YourAgent: [Executes dr-test, reports results]
```

**What it does:**
1. Creates temporary test environment
2. Downloads latest backup
3. Restores to test environment
4. Validates restoration
5. Reports success/failure
6. Cleans up test environment

### Use Case 2: Remote Test (Agent A tests Agent B)

```bash
# Production agent tests dev instance backup
openclaw-aws-backup dr-test --remote <instance-id>

# Or via conversation
your-user: "Test the dev instance backup"
YourAgent: [Connects to dev instance, runs DR test, reports]
```

**What it does:**
1. SSH to remote instance
2. Download remote instance's backup
3. Restore to test environment
4. Validate
5. Report back to requester
6. Cleanup

---

## Implementation

### Command: `dr-test`

**Location:** `bin/dr-test.cjs`

**Usage:**
```bash
# Self-test (test this instance's backup)
openclaw-aws-backup dr-test

# Test specific backup date
openclaw-aws-backup dr-test --date 2026-02-18

# Test remote instance
openclaw-aws-backup dr-test --remote i-XXXXXXXXXXXXX

# Test without cleanup (for debugging)
openclaw-aws-backup dr-test --no-cleanup

# JSON output
openclaw-aws-backup dr-test --json
```

### DR Test Process

**Phase 1: Preparation**
```javascript
1. Check latest backup exists
2. Verify backup integrity (checksum)
3. Create temporary test directory
4. Allocate test resources
```

**Phase 2: Restore**
```javascript
1. Download backup to test directory
2. Extract files
3. Decrypt sensitive data (if encrypted)
4. Restore to test paths (not production!)
5. Install dependencies (npm install, etc.)
```

**Phase 3: Validation**
```javascript
1. Check file integrity
   - All expected files present?
   - Checksums match?
   
2. Check configuration
   - OpenClaw config valid JSON?
   - Sessions present?
   - Memory files intact?
   
3. Check skills
   - Custom skills present?
   - Dependencies installed?
   - Skills executable?
   
4. Check SSH keys
   - Keys present?
   - Correct permissions?
   
5. Functional test
   - Can load OpenClaw config?
   - Can read session history?
   - Can read memory files?
```

**Phase 4: Reporting**
```javascript
1. your-userrate test report
2. Calculate success rate
3. Flag any issues
4. Return results
```

**Phase 5: Cleanup**
```javascript
1. Delete test directory
2. Remove temporary files
3. Release resources
```

---

## Validation Checklist

```javascript
{
  "dr_test_results": {
    "timestamp": "2026-02-19T12:00:00Z",
    "backup_tested": "s3://bucket/openclaw-aws-backups/2026-02-19-000000.tar.gz",
    "test_duration_seconds": 45,
    "overall_status": "PASS",
    "checks": {
      "backup_integrity": {
        "status": "PASS",
        "checksum_valid": true,
        "size_bytes": 52428800,
        "age_hours": 6
      },
      "file_restoration": {
        "status": "PASS",
        "files_expected": 1250,
        "files_restored": 1250,
        "files_missing": 0
      },
      "configuration": {
        "status": "PASS",
        "openclaw_config": "valid",
        "sessions": 5,
        "memory_files": 45,
        "projects": 6
      },
      "skills": {
        "status": "PASS",
        "custom_skills": 1,
        "workspace_skills": 1,
        "dependencies_installed": true
      },
      "ssh_keys": {
        "status": "PASS",
        "keys_found": 3,
        "permissions_correct": true
      },
      "functional_tests": {
        "status": "PASS",
        "can_load_config": true,
        "can_read_sessions": true,
        "can_read_memory": true,
        "can_execute_skills": true
      }
    },
    "issues": [],
    "recommendations": [
      "Backup is healthy",
      "All validation checks passed",
      "Restore would succeed"
    ]
  }
}
```

---

## Remote DR Test (Testing Another Agent)

### Additional IAM Permissions Required

**For remote testing, requesting agent needs:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SSMAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation"
      ],
      "Resource": [
        "arn:aws:ec2:*:*:instance/*",
        "arn:aws:ssm:*:*:*"
      ],
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Purpose": "OpenClaw"
        }
      }
    },
    {
      "Sid": "EC2Describe",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3RemoteBackupRead",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::*-openclaw-aws-backups",
        "arn:aws:s3:::*-openclaw-aws-backups/*"
      ]
    }
  ]
}
```

**Note:** Remote testing uses AWS Systems Manager (SSM) to run commands on target instance without SSH keys!

### Remote Test Workflow

```javascript
// Requesting agent (Production)
async remoteTest(targetInstanceId) {
  // 1. Verify target instance exists
  const instance = await ec2.describeInstances({
    InstanceIds: [targetInstanceId]
  });
  
  // 2. Send SSM command to run dr-test
  const command = await ssm.sendCommand({
    InstanceIds: [targetInstanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: {
      commands: ['cd /home/ubuntu && ./openclaw-aws-backup/bin/dr-test.cjs --json']
    }
  });
  
  // 3. Wait for command completion
  const result = await waitForCommand(command.CommandId, targetInstanceId);
  
  // 4. Parse and return results
  return JSON.parse(result.StandardOutputContent);
}
```

**Benefits:**
- No SSH keys needed
- Secure (IAM controlled)
- Auditable (CloudTrail logs)
- Works across accounts (with proper IAM)

---

## Integration with OpenClaw

### As OpenClaw Skill Command

**Register as skill command:**

```javascript
// In package.json
{
  "openclaw": {
    "commands": {
      "dr-test": {
        "description": "Test backup/restore without affecting live system",
        "options": {
          "remote": "Test another instance's backup",
          "date": "Test specific backup date",
          "no-cleanup": "Keep test environment for debugging"
        }
      }
    }
  }
}
```

**Usage in conversation:**

```
your-user: "Run a DR test"
YourAgent: [Executes] "Running DR test on latest backup..."
         [After 45 seconds]
         "✅ DR Test PASSED
          - Backup integrity: ✅
          - File restoration: ✅ (1250/1250)
          - Configuration: ✅ (5 sessions, 45 memory files)
          - Skills: ✅ (2 custom skills)
          - Functional tests: ✅
          
          Restore would succeed. No issues found."

your-user: "Test the dev instance backup"
YourAgent: [Executes remote test]
         "Testing dev instance (i-XXXXXXXXXXXXX) backup...
          ✅ DR Test PASSED
          Dev instance backup is healthy."
```

### Scheduled DR Tests

**Automate testing via cron:**

```bash
# Weekly DR test
openclaw cron add \
  --name "Weekly DR Test" \
  --schedule "0 3 * * 1" \
  --session isolated \
  --payload-kind agentTurn \
  --message "Run DR test and report results: openclaw-aws-backup dr-test"
```

---

## Test Environments

### Option 1: Local Directory (Fast)

```bash
# Test in local temp directory
DR_TEST_DIR=/tmp/openclaw-dr-test-$(date +%s)
# Fast, but uses local disk space
```

**Pros:**
- Fast (no network)
- Simple
- Low cost

**Cons:**
- Uses production disk
- Not true isolation

### Option 2: Docker Container (Isolated)

```bash
# Test in Docker container
docker run --rm \
  -v /tmp/dr-test:/restore \
  ubuntu:22.04 \
  /restore/dr-test.sh
```

**Pros:**
- True isolation
- Can't affect production
- Clean environment

**Cons:**
- Requires Docker
- Slightly slower

### Option 3: Separate EC2 Instance (Most Realistic)

```bash
# Launch temporary test instance
aws ec2 run-instances \
  --instance-type t3.micro \
  --user-data "$(cat dr-test-userdata.sh)"
  
# Run test
# Terminate after
```

**Pros:**
- Most realistic
- Separate network/compute
- Tests actual EC2 environment

**Cons:**
- Costs ~$0.01 per test
- Takes 2-3 minutes to launch

**Recommendation:** Option 1 for daily tests, Option 3 for monthly full tests

---

## Error Scenarios

### Scenario 1: Backup Missing
```
❌ DR Test FAILED
   Backup not found: s3://bucket/backups/2026-02-19.tar.gz
   Last successful backup: 2026-02-17 (2 days ago)
   Action: Check backup cron job
```

### Scenario 2: Corrupted Backup
```
❌ DR Test FAILED
   Backup checksum mismatch
   Expected: abc123...
   Got: def456...
   Action: Re-run backup immediately
```

### Scenario 3: Missing Files
```
⚠️  DR Test PARTIAL
   150 files missing from restore
   Critical: ~/.openclaw/openclaw.json (MISSING)
   Action: Review backup exclusions
```

### Scenario 4: Failed Functional Test
```
❌ DR Test FAILED
   Configuration invalid: JSON parse error in openclaw.json
   Skills not executable: bedrock-models missing dependencies
   Action: Test backup process on dev instance
```

---

## Deliverables

1. `bin/dr-test.cjs` - Main DR test command
2. `lib/dr-test-runner.js` - Test execution logic
3. `lib/dr-validator.js` - Validation checks
4. `lib/dr-remote.js` - Remote testing via SSM
5. `docs/DR-TEST-GUIDE.md` - Complete documentation
6. `tests/dr-test.test.js` - Unit tests

---

## Success Metrics

**DR test should:**
- Complete in < 2 minutes (local test)
- Report pass/fail clearly
- Flag specific issues
- Not affect production
- Clean up after itself
- Be automatable (cron)

**Monthly KPIs:**
- DR test success rate: >95%
- Average test duration: <90 seconds
- False positives: <5%
- Issues caught before real failure: >0

---

**Bottom line:** `openclaw-aws-backup dr-test` validates backups work without touching production. Run it weekly!
