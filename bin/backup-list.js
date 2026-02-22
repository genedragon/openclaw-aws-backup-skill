#!/usr/bin/env node
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function listBackups() {
  console.log(chalk.bold.cyan('\n📋 OpenClaw Backup - Available Backups\n'));
  
  // Load config
  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('❌ No configuration found. Run: openclaw-aws-backup setup'));
    process.exit(1);
  }
  
  try {
    const s3 = new S3Client({ region: config.region });
    
    const command = new ListObjectsV2Command({
      Bucket: config.s3.bucket,
      Prefix: config.s3.prefix + '/'
    });
    
    const response = await s3.send(command);
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log(chalk.yellow('No backups found'));
      return;
    }
    
    const backups = response.Contents
      .filter(obj => obj.Key.endsWith('.tar.gz'))
      .map(obj => {
        const name = path.basename(obj.Key, '.tar.gz');
        const date = obj.LastModified.toISOString().slice(0, 19).replace('T', ' ');
        const sizeMB = (obj.Size / (1024 * 1024)).toFixed(2);
        
        return { name, date, sizeMB, size: obj.Size };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    
    console.log(chalk.gray(`S3 Location: s3://${config.s3.bucket}/${config.s3.prefix}/\n`));
    console.log(chalk.bold('Backup Name'.padEnd(50)) + chalk.bold('Date'.padEnd(25)) + chalk.bold('Size'));
    console.log('-'.repeat(80));
    
    backups.forEach(backup => {
      console.log(
        backup.name.padEnd(50) +
        backup.date.padEnd(25) +
        `${backup.sizeMB} MB`
      );
    });
    
    console.log('\n' + chalk.green(`Total: ${backups.length} backup(s)`));
    console.log(chalk.gray(`Retention: Keep last ${config.retention.keep} backups\n`));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to list backups:'), error.message);
    process.exit(1);
  }
}

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'backup-config.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

listBackups().catch(error => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});
