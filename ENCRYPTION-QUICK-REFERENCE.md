# Encryption Quick Reference

## Choose Your Encryption Mode

### 🚀 No Encryption (Fastest)
**Best for:** Dev/testing, non-sensitive data, trusted environments

**Setup:**
```bash
openclaw-aws-backup setup
# → Enable encryption? No
```

**Pros:**
- Fastest performance
- Simplest setup
- No key management

**Cons:**
- Data stored in plaintext (unless S3 bucket has default encryption)
- Not recommended for production

---

### 🔐 KMS Encryption (Recommended)
**Best for:** Production, compliance, multi-instance

**Setup:**
```bash
openclaw-aws-backup setup
# → Enable encryption? Yes
# → Encryption method: KMS
# → Create KMS key? Yes
```

**Pros:**
- AWS-native, fully managed
- Automatic key rotation
- IAM access control
- Transparent encryption/decryption

**Cons:**
- KMS API costs (~$1/month per key + $0.03 per 10k requests)
- Requires AWS KMS permissions

---

### 🗝️ GPG Encryption (Portable)
**Best for:** Hybrid cloud, air-gapped backups, maximum portability

**Setup:**
```bash
# Install GPG first
sudo apt install gnupg -y

openclaw-aws-backup setup
# → Enable encryption? Yes
# → Encryption method: GPG
```

**Pros:**
- Works outside AWS
- Portable across cloud providers
- No KMS costs

**Cons:**
- Manual key management
- Must backup private key separately
- Slower than KMS (client-side encryption)

---

## Switching Modes

Run setup again to change encryption mode:
```bash
openclaw-aws-backup setup
```

New backups will use the new mode. Old backups remain in their original format.

---

## Verification

### Check Your Current Mode
```bash
cat config/backup-config.json | grep -A 4 "encryption"
```

### Verify Backup Encryption
```bash
# List your backups
openclaw-aws-backup list

# Check S3 metadata
aws s3api head-object \
  --bucket YOUR_BUCKET \
  --key YOUR_BACKUP_KEY \
  --region YOUR_REGION \
  --query '{Encryption:ServerSideEncryption,KMSKeyId:SSEKMSKeyId,Metadata:Metadata}'
```

**No encryption:** No ServerSideEncryption field (or AES256 if bucket default enabled)
**KMS encryption:** `"ServerSideEncryption": "aws:kms"`
**GPG encryption:** No ServerSideEncryption, file is pre-encrypted

---

## Cost Comparison

| Mode | Storage | Operations | Monthly Est. |
|------|---------|------------|--------------|
| None | S3 only | S3 API only | ~$0.50 (100GB) |
| KMS | S3 only | S3 + KMS API | ~$2.00 (100GB + daily backup) |
| GPG | S3 only | S3 API only | ~$0.50 (100GB) |

*Estimates based on us-west-2, 100GB storage, daily backups*

---

## Security Comparison

| Feature | No Encryption | KMS | GPG |
|---------|--------------|-----|-----|
| At-rest encryption | ❌ (or S3 default) | ✅ AES-256 | ✅ RSA-2048 |
| In-transit encryption | ✅ HTTPS | ✅ HTTPS | ✅ HTTPS |
| Key management | None | AWS managed | Manual |
| Key rotation | N/A | Automatic | Manual |
| Multi-cloud | ✅ | ❌ (AWS only) | ✅ |
| Compliance ready | ❌ | ✅ | ✅ (with key backup) |

---

## Recommendations

### Development
```
✅ No encryption - fastest iteration
```

### Staging
```
✅ KMS encryption - test production setup
```

### Production
```
✅ KMS encryption - best security/convenience balance
✅ GPG encryption - if multi-cloud or offline recovery needed
```

### Disaster Recovery
```
✅ GPG encryption - portable, works if AWS unavailable
```
