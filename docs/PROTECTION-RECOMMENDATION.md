# Protection Options - Recommendation

**Part of:** OpenClaw Backup to S3 Skill

---

## The Options

From COMPREHENSIVE-BACKUP-LIST.md, we have 4 protection options for sensitive data:

1. **Encrypt backup (GPG)**
2. **AWS Secrets Manager**
3. **S3 Server-side encryption (SSE)**
4. **Separate sensitive files**

---

## Recommended Approach: Hybrid (Options 3 + 4)

**Use S3 SSE-KMS + Separate sensitive files**

---

## Why This Combination?

### S3 SSE-KMS (Server-Side Encryption with KMS)

**For:** Most backup files (workspace, config, skills)

**Benefits:**
- ✅ Automatic encryption at rest
- ✅ No client-side overhead (fast backups)
- ✅ AWS manages keys (no key storage issues)
- ✅ Integrated with IAM (access control)
- ✅ Audit trail (CloudTrail logs all key usage)
- ✅ No additional cost (KMS free tier: 20,000 requests/month)

**How it works:**
```bash
# Automatic encryption on upload
aws s3 sync ~/.openclaw/workspace/ s3://bucket/workspace/ \
  --sse aws:kms \
  --sse-kms-key-id alias/openclaw-aws-backup

# Automatic decryption on download (if you have permissions)
aws s3 sync s3://bucket/workspace/ ~/.openclaw/workspace/
```

**Security:**
- Data encrypted at rest in S3
- KMS key controlled by IAM
- Can't decrypt without proper IAM permissions
- Audit log shows who accessed what, when

---

### Separate Sensitive Files (Encrypted with GPG)

**For:** SSH private keys, channel tokens

**Benefits:**
- ✅ Extra layer of protection
- ✅ Can use different passphrase than AWS
- ✅ Portable (works outside AWS)
- ✅ Can store separately (different bucket/region)
- ✅ Explicit decrypt step (human-in-the-loop)

**How it works:**
```bash
# Backup SSH keys with GPG encryption
tar -czf ssh-keys.tar.gz ~/.ssh/id_rsa ~/.ssh/*-deploy
gpg --encrypt --recipient gene@example.com ssh-keys.tar.gz
aws s3 cp ssh-keys.tar.gz.gpg s3://bucket/secrets/

# Restore requires passphrase
aws s3 cp s3://bucket/secrets/ssh-keys.tar.gz.gpg .
gpg --decrypt ssh-keys.tar.gz.gpg > ssh-keys.tar.gz
# [Enter passphrase]
tar -xzf ssh-keys.tar.gz -C ~/
```

**Security:**
- Passphrase required to decrypt
- Even if S3 bucket compromised, keys unreadable
- Can use YubiKey or similar for GPG key
- Offline backup possible (store GPG file on USB drive)

---

## Why NOT the Other Options?

### Why not GPG for everything? (Option 1)

**Cons:**
- Slow (encrypt/decrypt every file)
- Key management burden (where to store GPG key?)
- Breaks incremental backup (can't sync encrypted files efficiently)
- More complex restore (decrypt before extracting)

**When to use:** Very high security requirements, air-gapped environments

### Why not Secrets Manager for everything? (Option 2)

**Cons:**
- Cost ($0.40/secret/month - adds up for many files)
- Not designed for bulk data (5000 files × $0.40 = $2000/month!)
- API rate limits
- Overkill for non-sensitive data

**When to use:** Critical credentials only (API keys, tokens)

### Why not separate files alone? (Option 4 without encryption)

**Cons:**
- Still need to encrypt somehow
- Just moving the problem, not solving it

---

## Recommended Implementation

### Backup Strategy

**Tier 1: Bulk Data (S3 SSE-KMS)**
```bash
# Workspace, projects, memory, skills
aws s3 sync ~/.openclaw/workspace/ s3://bucket/workspace/ \
  --sse aws:kms \
  --sse-kms-key-id alias/openclaw-aws-backup

aws s3 sync ~/.openclaw/ s3://bucket/config/ \
  --sse aws:kms \
  --sse-kms-key-id alias/openclaw-aws-backup \
  --exclude "channels/*/token" \  # Exclude tokens
  --exclude "*/secrets/*"
```

**Tier 2: Sensitive Files (GPG + S3)**
```bash
# SSH keys, channel tokens
mkdir -p /tmp/sensitive
cp ~/.ssh/id_rsa ~/.ssh/*-deploy /tmp/sensitive/
cp ~/.openclaw/channels/*/token /tmp/sensitive/

tar -czf sensitive.tar.gz -C /tmp sensitive/
gpg --encrypt --recipient gene@example.com sensitive.tar.gz
aws s3 cp sensitive.tar.gz.gpg s3://bucket/secrets/ --sse AES256

# Cleanup
rm -rf /tmp/sensitive sensitive.tar.gz sensitive.tar.gz.gpg
```

---

### Restore Strategy

**Phase 1: Restore bulk data (automatic)**
```bash
# Download and decrypt automatically (IAM-based)
aws s3 sync s3://bucket/workspace/ ~/.openclaw/workspace/
aws s3 sync s3://bucket/config/ ~/.openclaw/
```

**Phase 2: Restore sensitive files (manual)**
```bash
# Download encrypted secrets
aws s3 cp s3://bucket/secrets/sensitive.tar.gz.gpg .

# Decrypt (requires passphrase)
gpg --decrypt sensitive.tar.gz.gpg > sensitive.tar.gz

# Extract
tar -xzf sensitive.tar.gz -C ~

# Set permissions
chmod 600 ~/.ssh/id_rsa ~/.ssh/*-deploy

# Cleanup
rm sensitive.tar.gz
```

---

## Cost Comparison

**For typical OpenClaw backup (~500 MB):**

| Option | Storage Cost | Key Cost | Total/Month |
|--------|--------------|----------|-------------|
| No encryption | $0.01 | $0 | $0.01 |
| S3 SSE-S3 | $0.01 | $0 | $0.01 |
| **S3 SSE-KMS** (recommended) | $0.01 | $0 (free tier) | **$0.01** |
| Secrets Manager (all files) | N/A | $200+ | $200+ |
| GPG everywhere | $0.01 | $0 | $0.01 |

**Recommended hybrid:** $0.01/month (same as no encryption!)

---

## Security Comparison

| Option | At Rest | In Transit | Access Control | Audit | Key Rotation |
|--------|---------|------------|----------------|-------|--------------|
| **S3 SSE-KMS** | ✅ Strong | ✅ TLS | ✅ IAM | ✅ CloudTrail | ✅ Automatic |
| GPG | ✅ Strong | ✅ TLS | ⚠️ Passphrase | ❌ None | ⚠️ Manual |
| Secrets Manager | ✅ Strong | ✅ TLS | ✅ IAM | ✅ CloudTrail | ✅ Automatic |
| S3 SSE-S3 | ✅ Weak | ✅ TLS | ✅ IAM | ⚠️ Basic | ❌ No |

**Recommended hybrid:** Best of both worlds

---

## Implementation Checklist

**Setup (one-time):**

- [ ] Create KMS key for backups
  ```bash
  aws kms create-key --description "OpenClaw backup encryption"
  aws kms create-alias --alias-name alias/openclaw-aws-backup --target-key-id <key-id>
  ```

- [ ] Update IAM role with KMS permissions
  ```bash
  aws iam put-role-policy --role-name OpenClawRole \
    --policy-name KMSAccess --policy-document file://kms-policy.json
  ```

- [ ] your-userrate GPG key pair (if not exists)
  ```bash
  gpg --full-generate-key
  # Choose RSA 4096, expires in 1 year, passphrase protected
  ```

- [ ] Export GPG public key to backup location
  ```bash
  gpg --export --armor gene@example.com > openclaw-aws-backup-key.asc
  # Store this somewhere safe (password manager, USB drive)
  ```

**Backup (automated):**

- [ ] Sync workspace with SSE-KMS
- [ ] Sync config with SSE-KMS (exclude secrets)
- [ ] Encrypt sensitive files with GPG
- [ ] Upload encrypted secrets to S3

**Restore (manual):**

- [ ] Download workspace and config (automatic decrypt)
- [ ] Download encrypted secrets
- [ ] GPG decrypt secrets (enter passphrase)
- [ ] Extract and set permissions
- [ ] Verify

---

## Recommendation Summary

**Use S3 SSE-KMS + GPG for sensitive files**

**Why:**
- **Simple:** Mostly automatic (SSE-KMS)
- **Secure:** Strong encryption, IAM-controlled
- **Cost-effective:** Free KMS tier
- **Fast:** No client-side bulk encryption
- **Auditable:** CloudTrail logs everything
- **Layered:** Extra protection for critical secrets

**Best practices:**
1. Use SSE-KMS for 95% of backup (workspace, projects, memory)
2. Use GPG for 5% of backup (SSH keys, tokens)
3. Store GPG passphrase securely (password manager)
4. Export GPG key to safe location (in case laptop dies)
5. Rotate GPG key annually
6. Test restore quarterly

---

**This is the best balance of security, simplicity, and cost.** 🔒
