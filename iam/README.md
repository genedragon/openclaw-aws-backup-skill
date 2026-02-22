# IAM Permissions Quick Reference

This directory contains IAM policy templates for the OpenClaw Backup Skill.

## Files

- **`backup-policy.json`** - Full backup & restore permissions (attach to primary instance)
- **`restore-policy.json`** - Minimal read-only permissions (attach to restore-only instance)

## Quick Setup

### For Primary Instance (Backup + Restore)

```bash
# Replace BACKUP_BUCKET_NAME in backup-policy.json
sed -i 's/BACKUP_BUCKET_NAME/your-actual-bucket/g' iam/backup-policy.json

# Get your instance role
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
ROLE_NAME=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' \
  --output text | cut -d'/' -f2)

# Attach policy to role
aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name OpenClawBackupPolicy \
  --policy-document file://iam/backup-policy.json
```

### For Restore-Only Instance

```bash
# Replace BACKUP_BUCKET_NAME in restore-policy.json
sed -i 's/BACKUP_BUCKET_NAME/your-actual-bucket/g' iam/restore-policy.json

# Attach to restore instance role
aws iam put-role-policy \
  --role-name YourRestoreInstanceRole \
  --policy-name OpenClawRestorePolicy \
  --policy-document file://iam/restore-policy.json
```

## Permissions Breakdown

### Backup Policy (backup-policy.json)

**S3 Actions:**
- `s3:PutObject` - Upload backup archives
- `s3:GetObject` - Download for restore
- `s3:DeleteObject` - Clean up old backups
- `s3:ListBucket` - List available backups

**KMS Actions:**
- `kms:Encrypt` - Encrypt backups
- `kms:Decrypt` - Decrypt for restore
- `kms:GenerateDataKey` - Generate encryption keys

### Restore Policy (restore-policy.json)

**S3 Actions (Read-Only):**
- `s3:GetObject` - Download backup archive
- `s3:ListBucket` - List available backups

**KMS Actions (Decrypt-Only):**
- `kms:Decrypt` - Decrypt downloaded backup
- `kms:DescribeKey` - Verify key access

## Security Best Practices

1. **Principle of Least Privilege:**
   - Primary instance: Full backup permissions
   - Restore instance: Read-only permissions
   - Never give more than needed!

2. **Bucket Scoping:**
   - Replace `BACKUP_BUCKET_NAME` with your actual bucket
   - Policies are scoped to single bucket only
   - Don't use wildcards in Resource ARNs

3. **KMS Scoping:**
   - Backup policy: KMS via S3 service only
   - Restore policy: Allow decrypt for any key (safe for read-only)
   - Consider adding specific key ARNs for production

4. **Instance Isolation:**
   - Development instances: No encryption (optional)
   - Production instances: KMS encryption (required)
   - Restore instances: Read-only + auto-terminate after use

## Testing Permissions

After attaching policy, verify access:

```bash
# Test S3 list access
aws s3 ls s3://your-bucket/openclaw-aws-backups/

# Test S3 read access
aws s3 cp s3://your-bucket/openclaw-aws-backups/test.txt /tmp/test.txt

# Test S3 write access (backup policy only)
echo "test" > /tmp/test-write.txt
aws s3 cp /tmp/test-write.txt s3://your-bucket/openclaw-aws-backups/test-write.txt

# Test KMS access (if using encryption)
aws kms describe-key --key-id alias/openclaw-aws-backup
```

## Troubleshooting

**Error: "Access Denied" on S3 operations**
- Check bucket name matches policy Resource ARN
- Verify role is attached to instance
- Check S3 bucket policy doesn't deny access

**Error: "KMS key not accessible"**
- Verify KMS key exists in same region
- Check KMS key policy allows instance role
- Ensure `kms:ViaService` matches your region

**Error: "Role not found"**
- Instance must have IAM instance profile attached
- Check with: `aws sts get-caller-identity`
- Attach via EC2 console: Actions → Security → Modify IAM role

## Full Documentation

See `docs/IAM-AND-CLOUDFORMATION.md` for:
- Complete CloudFormation templates
- Restore instance automation
- Emergency restore procedures
- Cost estimates
