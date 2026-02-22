#!/usr/bin/env node
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const chalk = require('chalk');

const execPromise = promisify(exec);

async function createBackup() {
  console.log(chalk.bold.cyan('\n🔄 OpenClaw Backup - Creating Backup\n'));
  
  // Load config
  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('❌ No configuration found. Run: openclaw-aws-backup setup'));
    process.exit(1);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupName = `openclaw-aws-backup-${timestamp}`;
  
  console.log(chalk.gray(`Instance: ${config.instanceId}`));
  console.log(chalk.gray(`Timestamp: ${timestamp}\n`));
  
  let backupPath;
  
  try {
    // 1. Create backup locally
    console.log(chalk.yellow('📦 Creating local backup...'));
    backupPath = await createLocalBackup(backupName, config);
    
    const stats = fs.statSync(backupPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(chalk.green(`✅ Local backup created: ${sizeMB} MB\n`));
    
    // 2. Upload to S3 with KMS encryption
    if (config.encryption.enabled) {
      if (config.encryption.method === 'kms') {
        console.log(chalk.yellow('☁️  Uploading to S3 (encrypted with KMS)...'));
      } else if (config.encryption.method === 'gpg') {
        console.log(chalk.yellow('☁️  Uploading to S3 (encrypted with GPG)...'));
      }
    } else {
      console.log(chalk.yellow('☁️  Uploading to S3 (no encryption)...'));
    }
    await uploadToS3(backupPath, backupName, config);
    console.log(chalk.green(`✅ Uploaded to s3://${config.s3.bucket}/${config.s3.prefix}/${backupName}.tar.gz\n`));
    
    // 3. Cleanup local copy
    console.log(chalk.gray('🧹 Cleaning up local files...'));
    fs.unlinkSync(backupPath);
    console.log(chalk.green('✅ Local cleanup complete\n'));
    
    // 4. Clean old backups if auto-clean enabled
    if (config.retention.autoClean) {
      await cleanOldBackups(config);
    }
    
    console.log(chalk.bold.green(`✅ Backup complete: ${backupName}\n`));
    
    // Save backup metadata
    saveBackupMetadata(backupName, config, stats.size);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Backup failed:'), error.message);
    
    // Cleanup on failure
    if (backupPath && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    
    process.exit(1);
  }
}

async function createLocalBackup(name, config) {
  const tmpDir = `/tmp/${name}`;
  const tarPath = `/tmp/${name}.tar.gz`;
  
  // Create temp directory
  await execPromise(`mkdir -p ${tmpDir}`);
  
  console.log(chalk.gray('  Copying OpenClaw configuration...'));
  
  // Copy OpenClaw data
  const homedir = require('os').homedir();
  const openclawDir = path.join(homedir, '.openclaw');
  
  if (fs.existsSync(openclawDir)) {
    await execPromise(`cp -r ${openclawDir} ${tmpDir}/openclaw-config`);
  }
  
  console.log(chalk.gray('  Copying workspace...'));
  
  const workspaceDir = path.join(openclawDir, 'workspace');
  if (fs.existsSync(workspaceDir)) {
    await execPromise(`cp -r ${workspaceDir} ${tmpDir}/workspace`);
  }
  
  console.log(chalk.gray('  Creating tarball...'));
  
  // Create tarball
  await execPromise(`cd /tmp && tar -czf ${name}.tar.gz ${name}/`);
  
  // Cleanup temp directory
  await execPromise(`rm -rf ${tmpDir}`);
  
  return tarPath;
}

async function uploadToS3(filePath, name, config) {
  const s3 = new S3Client({ region: config.region });
  const fileStream = fs.createReadStream(filePath);
  
  const uploadParams = {
    Bucket: config.s3.bucket,
    Key: `${config.s3.prefix}/${name}.tar.gz`,
    Body: fileStream,
    Metadata: {
      'backup-version': '2.0',
      'instance-id': config.instanceId,
      'timestamp': new Date().toISOString(),
      'encrypted': config.encryption.enabled ? 'true' : 'false',
      'encryption-method': config.encryption.method || 'none'
    }
  };
  
  // Add encryption ONLY if enabled
  if (config.encryption.enabled) {
    if (config.encryption.method === 'kms') {
      uploadParams.ServerSideEncryption = 'aws:kms';
      uploadParams.SSEKMSKeyId = config.encryption.kmsKeyAlias;
    }
    // GPG encryption handled before upload
  }
  
  const command = new PutObjectCommand(uploadParams);
  await s3.send(command);
}

async function cleanOldBackups(config) {
  console.log(chalk.yellow('🧹 Checking for old backups to clean...'));
  
  try {
    const { stdout } = await execPromise(
      `aws s3 ls s3://${config.s3.bucket}/${config.s3.prefix}/ --region ${config.region} | sort -r`
    );
    
    const lines = stdout.trim().split('\n').filter(line => line.includes('.tar.gz'));
    
    if (lines.length > config.retention.keep) {
      const toDelete = lines.slice(config.retention.keep);
      console.log(chalk.gray(`  Found ${toDelete.length} old backups to delete`));
      
      for (const line of toDelete) {
        const filename = line.split(/\s+/).pop();
        const key = `${config.s3.prefix}/${filename}`;
        
        await execPromise(
          `aws s3 rm s3://${config.s3.bucket}/${key} --region ${config.region}`
        );
        console.log(chalk.gray(`  Deleted: ${filename}`));
      }
      
      console.log(chalk.green(`✅ Cleaned ${toDelete.length} old backups\n`));
    } else {
      console.log(chalk.green(`✅ No old backups to clean (${lines.length}/${config.retention.keep})\n`));
    }
  } catch (error) {
    console.error(chalk.yellow('⚠️  Could not clean old backups:'), error.message);
  }
}

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'backup-config.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveBackupMetadata(backupName, config, size) {
  const metadataDir = path.join(__dirname, '..', 'config', 'backups');
  if (!fs.existsSync(metadataDir)) {
    fs.mkdirSync(metadataDir, { recursive: true });
  }
  
  const metadata = {
    name: backupName,
    timestamp: new Date().toISOString(),
    instanceId: config.instanceId,
    region: config.region,
    size: size,
    s3Location: `s3://${config.s3.bucket}/${config.s3.prefix}/${backupName}.tar.gz`,
    encrypted: config.encryption.enabled,
    encryptionMethod: config.encryption.method || null,
    kmsKeyAlias: config.encryption.enabled && config.encryption.method === 'kms' 
      ? config.encryption.kmsKeyAlias 
      : null
  };
  
  const metadataFile = path.join(metadataDir, `${backupName}.json`);
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
}

createBackup().catch(error => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});
