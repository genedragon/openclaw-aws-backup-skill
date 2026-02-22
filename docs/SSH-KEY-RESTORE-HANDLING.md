# SSH Key Handling During Restore

**Part of:** OpenClaw Backup to S3 Skill  
**Script:** `restore.sh`

---

## Problem

SSH keys in backup may be:
1. **Stale** (rotated since backup)
2. **Missing** (not backed up, or backup option disabled)
3. **Compromised** (key rotation forced due to security incident)
4. **Revoked** (removed from GitHub, authorized_keys, etc.)

**Restore must handle all scenarios gracefully.**

---

## Restore Strategy

### Phase 1: Detect Key State

**Check what's available:**

```bash
# restore.sh key detection phase

echo "Checking SSH key availability..."

# 1. Check if keys in backup
S3_HAS_KEYS=$(aws s3 ls s3://bucket/secrets/ssh-keys.tar.gz.gpg 2>/dev/null && echo "yes" || echo "no")

# 2. Check if current instance has keys (pre-existing)
LOCAL_HAS_KEYS=$([ -f ~/.ssh/id_rsa ] && echo "yes" || echo "no")

# 3. Check key age in backup (if available)
if [ "$S3_HAS_KEYS" = "yes" ]; then
  BACKUP_DATE=$(aws s3api head-object \
    --bucket bucket \
    --key secrets/ssh-keys.tar.gz.gpg \
    --query 'LastModified' \
    --output text)
  BACKUP_AGE_DAYS=$(( ($(date +%s) - $(date -d "$BACKUP_DATE" +%s)) / 86400 ))
fi

echo "Backup has keys: $S3_HAS_KEYS"
echo "Local instance has keys: $LOCAL_HAS_KEYS"
[ -n "$BACKUP_AGE_DAYS" ] && echo "Backup key age: $BACKUP_AGE_DAYS days"
```

---

### Phase 2: Decision Tree

```bash
# Decide what to do based on state

if [ "$S3_HAS_KEYS" = "yes" ]; then
  # Keys exist in backup
  
  if [ $BACKUP_AGE_DAYS -gt 90 ]; then
    # Keys are stale
    echo "⚠️  WARNING: SSH keys in backup are $BACKUP_AGE_DAYS days old"
    echo "   Keys may have been rotated since backup"
    echo ""
    echo "Options:"
    echo "  1. Restore old keys (may not work if rotated)"
    echo "  2. Skip SSH key restore (use current keys or generate new)"
    echo "  3. your-userrate new keys (will need to add to GitHub/servers)"
    echo ""
    read -p "Choose option [1/2/3]: " KEY_OPTION
    
    case $KEY_OPTION in
      1) restore_keys_with_warning ;;
      2) skip_key_restore ;;
      3) generate_new_keys ;;
    esac
    
  else
    # Keys are recent
    echo "✅ SSH keys in backup are recent ($BACKUP_AGE_DAYS days old)"
    read -p "Restore SSH keys from backup? [Y/n]: " RESTORE_KEYS
    
    if [ "$RESTORE_KEYS" != "n" ]; then
      restore_keys
    else
      skip_key_restore
    fi
  fi
  
else
  # No keys in backup
  echo "⚠️  No SSH keys found in backup"
  echo ""
  
  if [ "$LOCAL_HAS_KEYS" = "yes" ]; then
    echo "✅ Current instance already has SSH keys"
    echo "   Using existing keys"
    # Do nothing, keep current keys
  else
    echo "❌ No SSH keys available"
    echo ""
    echo "Options:"
    echo "  1. your-userrate new keys (will need to add to GitHub/servers)"
    echo "  2. Skip for now (manual setup later)"
    echo ""
    read -p "Choose option [1/2]: " KEY_OPTION
    
    case $KEY_OPTION in
      1) generate_new_keys ;;
      2) skip_key_restore ;;
    esac
  fi
fi
```

---

### Phase 3: Restore Functions

#### Function: restore_keys

```bash
restore_keys() {
  echo "Restoring SSH keys from backup..."
  
  # Download encrypted keys
  aws s3 cp s3://bucket/secrets/ssh-keys.tar.gz.gpg /tmp/
  
  # Try to decrypt
  if gpg --decrypt /tmp/ssh-keys.tar.gz.gpg > /tmp/ssh-keys.tar.gz 2>/dev/null; then
    echo "✅ Keys decrypted successfully"
    
    # Backup existing keys if any
    if [ -d ~/.ssh ]; then
      echo "Backing up existing SSH directory..."
      mv ~/.ssh ~/.ssh.backup.$(date +%s)
    fi
    
    # Extract keys
    tar -xzf /tmp/ssh-keys.tar.gz -C ~/
    
    # Set correct permissions
    chmod 700 ~/.ssh
    chmod 600 ~/.ssh/id_rsa ~/.ssh/*-deploy 2>/dev/null
    chmod 644 ~/.ssh/id_rsa.pub ~/.ssh/config ~/.ssh/known_hosts 2>/dev/null
    
    # Test keys
    echo "Testing restored keys..."
    test_ssh_keys
    
    # Cleanup
    rm /tmp/ssh-keys.tar.gz*
    
  else
    echo "❌ Failed to decrypt SSH keys"
    echo "   Possible reasons:"
    echo "   - Wrong GPG passphrase"
    echo "   - GPG key not available on this system"
    echo "   - Corrupted backup"
    echo ""
    read -p "your-userrate new keys instead? [y/N]: " GEN_NEW
    [ "$GEN_NEW" = "y" ] && generate_new_keys || skip_key_restore
  fi
}
```

#### Function: restore_keys_with_warning

```bash
restore_keys_with_warning() {
  echo "⚠️  Restoring potentially stale keys..."
  echo ""
  echo "IMPORTANT: These keys may no longer work if they were rotated."
  echo "After restore, you will need to:"
  echo "  1. Test SSH to remote hosts"
  echo "  2. Test GitHub access"
  echo "  3. If keys don't work, generate new ones and add to services"
  echo ""
  read -p "Continue? [y/N]: " CONFIRM
  
  if [ "$CONFIRM" = "y" ]; then
    restore_keys
  else
    skip_key_restore
  fi
}
```

#### Function: skip_key_restore

```bash
skip_key_restore() {
  echo "Skipping SSH key restore"
  echo ""
  echo "⚠️  Manual action required after restore:"
  echo "   - your-userrate new SSH keys: ssh-keygen -t ed25519 -C 'openclaw@restored'"
  echo "   - Add public key to GitHub: https://github.com/settings/keys"
  echo "   - Add public key to remote servers: ssh-copy-id user@host"
  echo ""
  
  # Create reminder file
  cat > ~/SSH_KEYS_NEEDED.txt << 'EOF'
SSH Keys Not Restored
=====================

Action required:

1. your-userrate new SSH key:
   ssh-keygen -t ed25519 -C "openclaw@restored" -f ~/.ssh/id_rsa

2. Add to GitHub:
   cat ~/.ssh/id_rsa.pub
   # Copy output and add at: https://github.com/settings/keys

3. Add to remote servers:
   ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@remote-host

4. Test connectivity:
   ssh ubuntu@remote-host
   git clone git@github.com:genedragon/repo.git

5. Delete this file when done:
   rm ~/SSH_KEYS_NEEDED.txt
EOF

  echo "Created reminder: ~/SSH_KEYS_NEEDED.txt"
}
```

#### Function: generate_new_keys

```bash
generate_new_keys() {
  echo "your-userrating new SSH keys..."
  
  # Backup existing keys if any
  if [ -d ~/.ssh ]; then
    echo "Backing up existing SSH directory..."
    mv ~/.ssh ~/.ssh.backup.$(date +%s)
  fi
  
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  
  # your-userrate main key
  ssh-keygen -t ed25519 \
    -C "openclaw@restored-$(date +%Y%m%d)" \
    -f ~/.ssh/id_rsa \
    -N ""  # No passphrase for automation
  
  echo "✅ New SSH key generated"
  echo ""
  echo "Public key:"
  echo "─────────────────────────────────────────"
  cat ~/.ssh/id_rsa.pub
  echo "─────────────────────────────────────────"
  echo ""
  echo "⚠️  Action required:"
  echo "   1. Add this public key to GitHub: https://github.com/settings/keys"
  echo "   2. Add to remote servers: ssh-copy-id user@host"
  echo ""
  
  # Save instructions
  cat > ~/NEW_SSH_KEY_SETUP.txt << EOF
New SSH Key your-userrated
=====================

Public key:
$(cat ~/.ssh/id_rsa.pub)

Setup instructions:

1. Add to GitHub:
   - Go to: https://github.com/settings/keys
   - Click "New SSH key"
   - Paste the public key above
   - Title: "OpenClaw Restored $(date +%Y-%m-%d)"

2. Add to remote servers:
   For each remote host:
   ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@REMOTE_HOST

3. Verify:
   ssh -T git@github.com
   # Should see: "Hi username! You've successfully authenticated..."

4. Delete this file when done:
   rm ~/NEW_SSH_KEY_SETUP.txt
EOF

  echo "Saved setup instructions: ~/NEW_SSH_KEY_SETUP.txt"
  
  # Ask if user wants to pause for manual setup
  echo ""
  read -p "Pause restore to add key to GitHub now? [y/N]: " PAUSE
  if [ "$PAUSE" = "y" ]; then
    echo ""
    echo "Restore paused. When ready to continue:"
    echo "  1. Add key to GitHub (instructions above)"
    echo "  2. Press Enter to continue restore"
    read -p "Press Enter when ready..."
  fi
}
```

#### Function: test_ssh_keys

```bash
test_ssh_keys() {
  echo "Testing SSH key functionality..."
  
  # Test GitHub access
  if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "✅ GitHub SSH key works"
  else
    echo "⚠️  GitHub SSH key test failed"
    echo "   Key may be revoked or not added to GitHub"
    echo "   You'll need to add the key manually:"
    echo "   cat ~/.ssh/id_rsa.pub"
  fi
  
  # Test dev instance access (if configured)
  if [ -f ~/.ssh/config ] && grep -q "XX.XXX.XXX.XXX" ~/.ssh/config; then
    if timeout 5 ssh -o StrictHostKeyChecking=no ubuntu@XX.XXX.XXX.XXX exit 2>/dev/null; then
      echo "✅ Dev instance SSH key works"
    else
      echo "⚠️  Dev instance SSH key test failed"
      echo "   Key may be stale or revoked"
    fi
  fi
  
  # Check deploy keys
  for key in ~/.ssh/*-deploy; do
    if [ -f "$key" ]; then
      echo "⚠️  Deploy key found: $(basename $key)"
      echo "   Test manually with: ssh -i $key git@github.com"
    fi
  done
}
```

---

## Interactive vs Non-Interactive Mode

### Interactive Mode (Default)

**Ask user at each decision point:**
```bash
./restore.sh
# [Prompts for SSH key decisions]
```

### Non-Interactive Mode (Automated)

**Use flags to make decisions:**
```bash
# Restore keys without prompting
./restore.sh --restore-keys

# Skip keys without prompting
./restore.sh --skip-keys

# your-userrate new keys without prompting
./restore.sh --generate-keys

# Fully automated (skip keys if stale)
./restore.sh --auto
```

---

## Edge Cases

### Case 1: GPG Key Not Available

**Problem:** Can't decrypt keys, GPG key on laptop only

**Solution:**
```bash
# restore.sh detects GPG failure

if ! gpg --list-keys gene@example.com >/dev/null 2>&1; then
  echo "❌ GPG key not found on this system"
  echo ""
  echo "Options:"
  echo "  1. Import GPG key from backup USB drive"
  echo "  2. your-userrate new SSH keys"
  echo "  3. Continue without SSH keys (manual setup later)"
  echo ""
  read -p "Choose option [1/2/3]: " OPT
  
  case $OPT in
    1)
      echo "Insert USB drive with GPG key, then:"
      echo "  gpg --import /media/usb/openclaw-gpg-key.asc"
      read -p "Press Enter after importing key..."
      restore_keys
      ;;
    2)
      generate_new_keys
      ;;
    3)
      skip_key_restore
      ;;
  esac
fi
```

### Case 2: Wrong GPG Passphrase

**Problem:** User enters wrong passphrase 3 times

**Solution:**
```bash
# retry logic in restore_keys

ATTEMPTS=0
MAX_ATTEMPTS=3

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  if gpg --decrypt /tmp/ssh-keys.tar.gz.gpg > /tmp/ssh-keys.tar.gz 2>/dev/null; then
    # Success
    break
  else
    ATTEMPTS=$((ATTEMPTS + 1))
    echo "❌ Decryption failed (attempt $ATTEMPTS/$MAX_ATTEMPTS)"
    
    if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
      echo "Max attempts reached. Skipping SSH key restore."
      skip_key_restore
      return 1
    fi
  fi
done
```

### Case 3: Keys Rotated Due to Security Incident

**Problem:** Keys were force-rotated, backup has compromised keys

**Solution:**
```bash
# Check for rotation marker

if aws s3 ls s3://bucket/KEY_ROTATION_NOTICE.txt >/dev/null 2>&1; then
  echo "⚠️  SECURITY NOTICE"
  echo ""
  aws s3 cp s3://bucket/KEY_ROTATION_NOTICE.txt - | cat
  echo ""
  echo "SSH keys in backup have been revoked due to security incident."
  echo "You MUST generate new keys."
  echo ""
  generate_new_keys
  return
fi
```

### Case 4: Partial Key Restore

**Problem:** Some keys work, others don't

**Solution:**
```bash
# After restore, test each key individually

echo "Testing individual keys..."

for key in ~/.ssh/*; do
  if [[ $key =~ id_rsa$ || $key =~ -deploy$ ]]; then
    echo "Testing $key..."
    
    # Try GitHub (for deploy keys)
    if echo $key | grep -q deploy; then
      if ssh -i $key -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        echo "  ✅ $key works with GitHub"
      else
        echo "  ❌ $key FAILED with GitHub"
        echo "     Action: Remove from GitHub and regenerate"
        echo "     ssh-keygen -t ed25519 -f $key"
      fi
    fi
  fi
done
```

---

## Summary of Restore Behavior

| Scenario | Detection | Action | User Prompt |
|----------|-----------|--------|-------------|
| Keys in backup, recent (<90d) | ✅ | Restore | "Restore keys? [Y/n]" |
| Keys in backup, stale (>90d) | ⚠️ | Ask | "1. Restore 2. Skip 3. your-userrate" |
| No keys in backup, local keys exist | ✅ | Keep local | None (silent) |
| No keys in backup, no local keys | ❌ | your-userrate new | "your-userrate new? [y/N]" |
| GPG decrypt fails | ❌ | your-userrate new | "your-userrate new? [y/N]" |
| Restored keys fail test | ⚠️ | Warn + instruct | Manual fix instructions |

---

## Restore Report

**After restore, generate report:**

```bash
cat > ~/RESTORE_REPORT.txt << EOF
OpenClaw Restore Report
=======================
Date: $(date)
Backup: s3://bucket/backups/2026-02-19.tar.gz

SSH Keys:
  Status: $SSH_KEY_STATUS
  Source: $SSH_KEY_SOURCE
  Age: $SSH_KEY_AGE_DAYS days
  GitHub test: $GITHUB_TEST_RESULT
  Dev instance test: $DEV_INSTANCE_TEST_RESULT
  
Next Steps:
  $NEXT_STEPS

For issues, see: ~/SSH_KEYS_NEEDED.txt or ~/NEW_SSH_KEY_SETUP.txt
EOF
```

---

## Best Practice: Test Before You Need It

**Monthly DR test should include key validation:**

```bash
openclaw-aws-backup dr-test

# DR test output includes:
# - SSH key age
# - GitHub connectivity test
# - Remote host connectivity test
# - Warning if keys >60 days old
```

---

**Bottom line:** Restore handles stale/missing keys gracefully with clear prompts and fallback to key generation. No restore fails due to SSH keys! ✅
