#!/usr/bin/env node
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const chalk = require('chalk');

const execPromise = util.promisify(exec);

async function setup() {
  console.log(chalk.bold.cyan('\n🔒 OpenClaw Backup Skill - Setup Wizard\n'));
  
  // Get instance info
  const instanceId = await getInstanceId();
  const region = await getRegion();
  
  console.log(chalk.gray(`Instance: ${instanceId}`));
  console.log(chalk.gray(`Region: ${region}\n`));
  
  // Ask questions
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'backupFrequency',
      message: 'How often do you want automated backups?',
      choices: [
        { name: 'Manual only (backup when requested)', value: 'manual' },
        { name: 'Every 6 hours', value: '6h' },
        { name: 'Daily (midnight)', value: 'daily' },
        { name: 'Weekly (Sunday midnight)', value: 'weekly' },
        { name: 'Custom cron expression', value: 'custom' }
      ]
    },
    {
      type: 'input',
      name: 'customCron',
      message: 'Enter cron expression:',
      when: (answers) => answers.backupFrequency === 'custom',
      validate: (input) => input.trim() ? true : 'Cron expression required'
    },
    {
      type: 'input',
      name: 's3Bucket',
      message: 'S3 bucket name for backups:',
      default: 'openclaw-aws-backups',
      validate: (input) => /^[a-z0-9.-]+$/.test(input) || 'Invalid bucket name'
    },
    {
      type: 'confirm',
      name: 'enableEncryption',
      message: 'Enable encryption for backups?',
      default: true
    },
    {
      type: 'list',
      name: 'encryptionMethod',
      message: 'Encryption method:',
      when: (answers) => answers.enableEncryption,
      choices: [
        { name: 'KMS (AWS Key Management Service)', value: 'kms' },
        { name: 'GPG (GNU Privacy Guard)', value: 'gpg' }
      ],
      default: 'kms'
    },
    {
      type: 'confirm',
      name: 'createKmsKey',
      message: 'Create KMS key?',
      when: (answers) => answers.enableEncryption && answers.encryptionMethod === 'kms',
      default: true
    },
    {
      type: 'confirm',
      name: 'enableMemoryProtection',
      message: 'Enable memory protection (swap + systemd limits)?',
      default: true
    }
  ]);
  
  // Generate config
  const config = {
    instanceId,
    region,
    backupFrequency: answers.backupFrequency,
    customCron: answers.customCron,
    s3: {
      bucket: answers.s3Bucket,
      prefix: `openclaw-aws-backups/instance-${instanceId}`
    },
    encryption: {
      enabled: answers.enableEncryption || false,
      method: answers.encryptionMethod || null,
      kmsKeyAlias: answers.enableEncryption && answers.encryptionMethod === 'kms'
        ? `alias/openclaw-aws-backup-${instanceId}`
        : null,
      gpgRecipient: answers.enableEncryption && answers.encryptionMethod === 'gpg'
        ? `openclaw-aws-backup-${instanceId}@local`
        : null
    },
    memoryProtection: {
      enabled: answers.enableMemoryProtection,
      swap: '2G',
      memoryMax: '1200M',
      memoryHigh: '1000M'
    },
    retention: {
      keep: 30,  // Keep last 30 backups
      autoClean: true
    }
  };
  
  // Save config
  const configDir = path.join(__dirname, '..', 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(configDir, 'backup-config.json'),
    JSON.stringify(config, null, 2)
  );
  console.log(chalk.green('✅ Configuration saved\n'));
  
  // Create KMS key if requested
  if (answers.createKmsKey && answers.enableEncryption && answers.encryptionMethod === 'kms') {
    await createKmsKey(config);
  }
  
  // Setup GPG if requested
  if (answers.enableEncryption && answers.encryptionMethod === 'gpg') {
    await setupGPG(config);
  }
  
  // Setup memory protection if requested
  if (answers.enableMemoryProtection) {
    await setupMemoryProtection(config);
  }
  
  // Setup cron if not manual
  if (answers.backupFrequency !== 'manual') {
    await setupCron(config);
  }
  
  // Create S3 bucket if needed
  await setupS3Bucket(config);
  
  console.log(chalk.bold.green('\n✅ Setup complete!\n'));
  console.log('To create a backup: ' + chalk.cyan('openclaw-aws-backup create'));
  console.log('To restore: ' + chalk.cyan('openclaw-aws-backup restore'));
  console.log('To test: ' + chalk.cyan('openclaw-aws-backup test\n'));
}

async function getInstanceId() {
  try {
    const { stdout } = await execPromise('ec2-metadata --instance-id 2>/dev/null');
    const match = stdout.match(/instance-id: (i-[a-f0-9]+)/);
    return match ? match[1] : 'local-dev';
  } catch {
    return 'local-dev';
  }
}

async function getRegion() {
  try {
    const { stdout } = await execPromise('ec2-metadata --availability-zone 2>/dev/null');
    const match = stdout.match(/availability-zone: ([a-z0-9-]+)/);
    if (match) {
      return match[1].slice(0, -1);  // Remove trailing letter
    }
  } catch {}
  
  // Fallback to AWS CLI
  try {
    const { stdout } = await execPromise('aws configure get region 2>/dev/null');
    return stdout.trim() || 'us-west-2';
  } catch {
    return 'us-west-2';
  }
}

async function createKmsKey(config) {
  console.log(chalk.yellow('🔑 Creating KMS key...'));
  
  try {
    // Check if key already exists
    const { stdout } = await execPromise(
      `aws kms list-aliases --region ${config.region} --query "Aliases[?AliasName=='${config.encryption.kmsKeyAlias}'].TargetKeyId" --output text`
    );
    
    if (stdout.trim()) {
      console.log(chalk.green('✅ KMS key already exists'));
      return;
    }
    
    // Create new key
    const createCmd = `aws kms create-key --description "OpenClaw backup encryption for ${config.instanceId}" --region ${config.region} --output json`;
    const { stdout: keyJson } = await execPromise(createCmd);
    const keyData = JSON.parse(keyJson);
    const keyId = keyData.KeyMetadata.KeyId;
    
    // Create alias
    await execPromise(
      `aws kms create-alias --alias-name ${config.encryption.kmsKeyAlias} --target-key-id ${keyId} --region ${config.region}`
    );
    
    console.log(chalk.green('✅ KMS key created: ' + keyId));
  } catch (error) {
    console.error(chalk.red('❌ Failed to create KMS key:'), error.message);
    console.log(chalk.yellow('⚠️  You may need to create it manually or check IAM permissions'));
  }
}

async function setupGPG(config) {
  console.log(chalk.yellow('🔐 Setting up GPG encryption...'));
  
  try {
    // Check if GPG is installed
    await execPromise('which gpg');
    
    // Check if key already exists
    const { stdout } = await execPromise(`gpg --list-keys ${config.encryption.gpgRecipient} 2>/dev/null || echo ""`);
    
    if (stdout.includes(config.encryption.gpgRecipient)) {
      console.log(chalk.green('✅ GPG key already exists'));
      return;
    }
    
    // Generate GPG key
    console.log(chalk.gray('  Generating GPG key (this may take a moment)...'));
    const gpgBatch = `%no-protection
Key-Type: RSA
Key-Length: 2048
Name-Real: OpenClaw Backup
Name-Email: ${config.encryption.gpgRecipient}
Expire-Date: 0
%commit
`;
    
    const gpgBatchFile = '/tmp/gpg-batch.txt';
    fs.writeFileSync(gpgBatchFile, gpgBatch);
    
    await execPromise(`gpg --batch --generate-key ${gpgBatchFile}`);
    fs.unlinkSync(gpgBatchFile);
    
    console.log(chalk.green('✅ GPG key generated'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to setup GPG:'), error.message);
    console.log(chalk.yellow('⚠️  You may need to install GPG or configure it manually'));
  }
}

async function setupMemoryProtection(config) {
  console.log(chalk.yellow('🛡️  Setting up memory protection...'));
  
  try {
    // Check if swap exists
    const { stdout: swapStatus } = await execPromise('swapon --show');
    
    if (!swapStatus.trim()) {
      console.log(chalk.gray('  Creating 2GB swap file...'));
      await execPromise('sudo fallocate -l 2G /swapfile');
      await execPromise('sudo chmod 600 /swapfile');
      await execPromise('sudo mkswap /swapfile');
      await execPromise('sudo swapon /swapfile');
      
      // Make permanent
      const fstabEntry = '/swapfile none swap sw 0 0\n';
      await execPromise(`echo "${fstabEntry}" | sudo tee -a /etc/fstab`);
      
      console.log(chalk.green('  ✓ Swap configured'));
    } else {
      console.log(chalk.green('  ✓ Swap already configured'));
    }
    
    // Setup systemd limits
    console.log(chalk.gray('  Configuring systemd memory limits...'));
    const serviceOverride = `[Service]
MemoryMax=${config.memoryProtection.memoryMax}
MemoryHigh=${config.memoryProtection.memoryHigh}
`;
    
    const overrideDir = '/etc/systemd/system/openclaw.service.d';
    await execPromise(`sudo mkdir -p ${overrideDir}`);
    await execPromise(`echo "${serviceOverride}" | sudo tee ${overrideDir}/memory.conf`);
    await execPromise('sudo systemctl daemon-reload');
    
    console.log(chalk.green('✅ Memory protection configured'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to setup memory protection:'), error.message);
    console.log(chalk.yellow('⚠️  Continuing without memory protection'));
  }
}

async function setupCron(config) {
  console.log(chalk.yellow('⏰ Setting up automated backups...'));
  
  let cronExpression;
  
  switch (config.backupFrequency) {
    case '6h':
      cronExpression = '0 */6 * * *';  // Every 6 hours
      break;
    case 'daily':
      cronExpression = '0 0 * * *';  // Midnight daily
      break;
    case 'weekly':
      cronExpression = '0 0 * * 0';  // Midnight Sunday
      break;
    case 'custom':
      cronExpression = config.customCron;
      break;
  }
  
  const backupScriptPath = path.join(__dirname, 'backup-create.js');
  const cronCommand = `node ${backupScriptPath}`;
  
  console.log(chalk.gray(`  Schedule: ${cronExpression}`));
  console.log(chalk.gray(`  Command: ${cronCommand}`));
  
  // Save cron config for later integration with OpenClaw cron
  const cronConfig = {
    schedule: cronExpression,
    command: cronCommand,
    description: 'OpenClaw automated backup'
  };
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'config', 'cron-config.json'),
    JSON.stringify(cronConfig, null, 2)
  );
  
  console.log(chalk.green('✅ Cron schedule saved (integrate with OpenClaw cron manually)'));
}

async function setupS3Bucket(config) {
  console.log(chalk.yellow('☁️  Configuring S3 bucket...'));
  
  try {
    // Check if bucket exists
    try {
      await execPromise(`aws s3 ls s3://${config.s3.bucket} --region ${config.region} 2>/dev/null`);
      console.log(chalk.green('  ✓ Bucket exists'));
    } catch {
      // Create bucket
      console.log(chalk.gray(`  Creating bucket: ${config.s3.bucket}...`));
      
      if (config.region === 'us-east-1') {
        await execPromise(`aws s3 mb s3://${config.s3.bucket}`);
      } else {
        await execPromise(
          `aws s3 mb s3://${config.s3.bucket} --region ${config.region} --create-bucket-configuration LocationConstraint=${config.region}`
        );
      }
      
      console.log(chalk.green('  ✓ Bucket created'));
    }
    
    // Enable versioning
    await execPromise(
      `aws s3api put-bucket-versioning --bucket ${config.s3.bucket} --versioning-configuration Status=Enabled --region ${config.region}`
    );
    console.log(chalk.green('  ✓ Versioning enabled'));
    
    // Apply lifecycle policy for retention
    const lifecyclePolicy = {
      Rules: [
        {
          Id: 'DeleteOldBackups',
          Status: 'Enabled',
          Prefix: config.s3.prefix,
          NoncurrentVersionExpiration: {
            NoncurrentDays: config.retention.keep
          }
        }
      ]
    };
    
    const policyFile = '/tmp/lifecycle-policy.json';
    fs.writeFileSync(policyFile, JSON.stringify(lifecyclePolicy));
    
    await execPromise(
      `aws s3api put-bucket-lifecycle-configuration --bucket ${config.s3.bucket} --lifecycle-configuration file://${policyFile} --region ${config.region}`
    );
    fs.unlinkSync(policyFile);
    
    console.log(chalk.green('  ✓ Lifecycle policy applied'));
    console.log(chalk.green('✅ S3 bucket configured'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to configure S3:'), error.message);
    console.log(chalk.yellow('⚠️  You may need to configure S3 manually'));
  }
}

setup().catch(error => {
  console.error(chalk.red('\n❌ Setup failed:'), error);
  process.exit(1);
});
