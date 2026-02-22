# SSH Key Backup & Rotation Requirements

**Part of:** OpenClaw Backup to S3 Skill

---

## SSH Key Backup (Default: YES)

### What Gets Backed Up

**Default behavior: Backup ALL SSH keys**

```bash
~/.ssh/
├── id_rsa              ⚠️ Private key (encrypt!)
├── id_rsa.pub          ✅ Public key
├── bedrock-models-deploy  ⚠️ Deploy key (encrypt!)
├── known_hosts         ✅ Safe
└── config              ✅ Safe
```

### Security Warning ⚠️

**IMPORTANT:** SSH keys are backed up by default, but you should rotate them regularly!

**Why rotation matters:**
- Backup stored in S3 for 30+ days
- If backup is compromised, old keys still work
- Regular rotation limits exposure window

**Rotation schedule:**
- **Deploy keys:** Every 90 days
- **Instance keys:** Every 6 months
- **After backup restore:** Immediately

**Backup creates risk window:**
```
Day 0:  Key created, backed up to S3
Day 30: Key rotated, NEW key created
Day 60: Old backup still has Day 0 key
        If backup compromised, Day 0 key still works on old systems!
```

**Mitigation:**
1. Rotate keys regularly
2. Encrypt backups with strong passphrase
3. Use AWS Secrets Manager for critical keys
4. Delete old backups after key rotation

---

## User Control

**Enable/disable SSH key backup:**

```bash
# Backup script
./backup.sh --ssh-keys          # Default: backup keys
./backup.sh --no-ssh-keys       # Skip SSH keys
./backup.sh --ssh-keys-encrypt  # Encrypt with GPG (recommended)
```

**Configuration:**
```json
{
  "backup": {
    "ssh_keys": {
      "enabled": true,
      "encrypt": true,
      "warn_rotation": true,
      "max_age_days": 90
    }
  }
}
```

---

## Rotation Warnings

**Backup script checks key age:**

```bash
# Warn if keys are old
for key in ~/.ssh/id_rsa ~/.ssh/*-deploy; do
  AGE_DAYS=$(( ($(date +%s) - $(stat -c %Y "$key")) / 86400 ))
  if [ $AGE_DAYS -gt 90 ]; then
    echo "⚠️  WARNING: $key is $AGE_DAYS days old"
    echo "   Consider rotating this key"
  fi
done
```

---

## Backup Storage

**Options:**

1. **Encrypted in S3** (recommended for automation)
2. **AWS Secrets Manager** (best security, manual setup)
3. **Skip backup** (regenerate keys on restore)

**Recommendation:** Encrypted S3 + regular rotation

---

**Next:** See framework project for key rotation automation requirements.
