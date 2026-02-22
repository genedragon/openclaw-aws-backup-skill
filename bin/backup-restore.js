#!/usr/bin/env node
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const chalk = require('chalk');
const inquirer = require('inquirer');

const execPromise = promisify(exec);

async function restoreBackup() {
  console.log(chalk.bold.cyan('\n🔄 OpenClaw Backup - Restore\n'));
  
  // Load config
  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('❌ No configuration found. Run: openclaw-aws-backup setup'));
    process.exit(1);
  }
  
  try {
    // 1. List available backups
    console.log(chalk.yellow('📋 Fetching available backups...\n'));
    const backups = await listBackups(config);
    
    if (backups.length === 0) {
      console.log(chalk.red('❌ No backups found'));
      process.exit(1);
    }
    
    // 2. Let user choose backup
    const { selectedBackup } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedBackup',
        message: 'Select backup to restore:',
        choices: backups.map(b => ({
          name: `${b.name} (${b.date}, ${b.sizeMB} MB)`,
          value: b
        }))
      }
    ]);
    
    // 3. Confirm restore
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow('⚠️  This will overwrite current OpenClaw data. Continue?'),
        default: false
      }
    ]);
    
    if (!confirm) {
      console.log(chalk.gray('Restore cancelled'));
      process.exit(0);
    }
    
    // 4. Download backup
    console.log(chalk.yellow('\n☁️  Downloading backup from S3...'));
    const backupPath = await downloadBackup(selectedBackup.key, config);
    console.log(chalk.green('✅ Download complete\n'));
    
    // 5. Extract and restore
    console.log(chalk.yellow('📦 Extracting backup...'));
    await extractBackup(backupPath);
    console.log(chalk.green('✅ Extraction complete\n'));
    
    // 6. Restore files
    console.log(chalk.yellow('🔄 Restoring OpenClaw data...'));
    await restoreFiles(backupPath);
    console.log(chalk.green('✅ Restore complete\n'));
    
    // 7. Cleanup
    console.log(chalk.gray('🧹 Cleaning up temporary files...'));
    await cleanupRestore(backupPath);
    console.log(chalk.green('✅ Cleanup complete\n'));
    
    console.log(chalk.bold.green('✅ Restore successful!\n'));
    console.log(chalk.yellow('⚠️  Restart OpenClaw for changes to take effect'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Restore failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function listBackups(config) {
  const s3 = new S3Client({ region: config.region });
  
  const command = new ListObjectsV2Command({
    Bucket: config.s3.bucket,
    Prefix: config.s3.prefix + '/'
  });
  
  const response = await s3.send(command);
  
  if (!response.Contents || response.Contents.length === 0) {
    return [];
  }
  
  return response.Contents
    .filter(obj => obj.Key.endsWith('.tar.gz'))
    .map(obj => {
      const name = path.basename(obj.Key, '.tar.gz');
      const date = obj.LastModified.toISOString().slice(0, 19).replace('T', ' ');
      const sizeMB = (obj.Size / (1024 * 1024)).toFixed(2);
      
      return {
        name,
        key: obj.Key,
        date,
        sizeMB,
        size: obj.Size
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function downloadBackup(key, config) {
  const s3 = new S3Client({ region: config.region });
  const filename = path.basename(key);
  const downloadPath = `/tmp/${filename}`;
  
  // Use AWS CLI for download (shows progress)
  // KMS decryption is automatic if backup was encrypted with KMS
  await execPromise(
    `aws s3 cp s3://${config.s3.bucket}/${key} ${downloadPath} --region ${config.region}`
  );
  
  // Handle GPG decryption if needed
  if (config.encryption.enabled && config.encryption.method === 'gpg') {
    console.log(chalk.gray('  Decrypting with GPG...'));
    const decryptedPath = `${downloadPath}.decrypted`;
    await execPromise(`gpg --decrypt ${downloadPath} > ${decryptedPath}`);
    fs.unlinkSync(downloadPath);
    fs.renameSync(decryptedPath, downloadPath);
    console.log(chalk.green('  ✓ GPG decryption complete'));
  }
  // KMS: decryption is automatic (handled by AWS)
  // No encryption: file is ready as-is
  
  return downloadPath;
}

async function extractBackup(backupPath) {
  const extractDir = backupPath.replace('.tar.gz', '');
  
  // Extract tarball
  await execPromise(`cd /tmp && tar -xzf ${path.basename(backupPath)}`);
  
  return extractDir;
}

async function restoreFiles(backupPath) {
  const extractDir = backupPath.replace('.tar.gz', '');
  const homedir = require('os').homedir();
  const openclawDir = path.join(homedir, '.openclaw');
  
  // Backup current config before restore
  if (fs.existsSync(openclawDir)) {
    const backupCurrent = `${openclawDir}.pre-restore-${Date.now()}`;
    console.log(chalk.gray(`  Backing up current config to: ${backupCurrent}`));
    await execPromise(`cp -r ${openclawDir} ${backupCurrent}`);
  }
  
  // Restore OpenClaw config
  const restoredOpenclawDir = path.join(extractDir, 'openclaw-config');
  if (fs.existsSync(restoredOpenclawDir)) {
    console.log(chalk.gray('  Restoring OpenClaw configuration...'));
    
    // Validate backup contains essential files
    const essentialFiles = ['openclaw.json'];
    const missing = essentialFiles.filter(f => !fs.existsSync(path.join(restoredOpenclawDir, f)));
    if (missing.length > 0) {
      console.log(chalk.yellow(`  ⚠️  Warning: Backup missing essential files: ${missing.join(', ')}`));
      console.log(chalk.yellow('  The current openclaw.json will be preserved if it exists.'));
    }
    
    // Atomic replacement: rename current, move new, remove old
    // This ensures we never have a moment where ~/.openclaw doesn't exist
    const tempDir = `${openclawDir}.temp-${Date.now()}`;
    if (fs.existsSync(openclawDir)) {
      await execPromise(`mv ${openclawDir} ${tempDir}`);
    }
    
    try {
      await execPromise(`cp -r ${restoredOpenclawDir} ${openclawDir}`);
      
      // If openclaw.json is missing from backup, copy from temp backup
      const openclawJson = path.join(openclawDir, 'openclaw.json');
      if (!fs.existsSync(openclawJson) && fs.existsSync(tempDir)) {
        const tempJson = path.join(tempDir, 'openclaw.json');
        if (fs.existsSync(tempJson)) {
          console.log(chalk.yellow('  Preserving existing openclaw.json...'));
          await execPromise(`cp ${tempJson} ${openclawJson}`);
        }
      }
      
      // Success - remove temp backup
      if (fs.existsSync(tempDir)) {
        await execPromise(`rm -rf ${tempDir}`);
      }
    } catch (error) {
      // Restore failed - roll back
      console.error(chalk.red('  ❌ Restore failed, rolling back...'));
      if (fs.existsSync(openclawDir)) {
        await execPromise(`rm -rf ${openclawDir}`);
      }
      if (fs.existsSync(tempDir)) {
        await execPromise(`mv ${tempDir} ${openclawDir}`);
      }
      throw error;
    }
  }
  
  // Restore workspace
  const restoredWorkspaceDir = path.join(extractDir, 'workspace');
  const workspaceDir = path.join(openclawDir, 'workspace');
  
  if (fs.existsSync(restoredWorkspaceDir)) {
    console.log(chalk.gray('  Restoring workspace...'));
    await execPromise(`rm -rf ${workspaceDir}`);
    await execPromise(`cp -r ${restoredWorkspaceDir} ${workspaceDir}`);
  }
}

async function cleanupRestore(backupPath) {
  const extractDir = backupPath.replace('.tar.gz', '');
  
  // Remove tarball
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Remove extracted directory
  if (fs.existsSync(extractDir)) {
    await execPromise(`rm -rf ${extractDir}`);
  }
}

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'backup-config.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

restoreBackup().catch(error => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});
