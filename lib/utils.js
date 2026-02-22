/**
 * Shared utilities for OpenClaw Backup Skill
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

/**
 * Load backup configuration
 */
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'backup-config.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Save backup configuration
 */
function saveConfig(config) {
  const configDir = path.join(__dirname, '..', 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  const configPath = path.join(configDir, 'backup-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get AWS instance ID
 */
async function getInstanceId() {
  try {
    const { stdout } = await execPromise('ec2-metadata --instance-id 2>/dev/null');
    const match = stdout.match(/instance-id: (i-[a-f0-9]+)/);
    return match ? match[1] : 'local-dev';
  } catch {
    return 'local-dev';
  }
}

/**
 * Get AWS region
 */
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

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date to ISO string without milliseconds
 */
function formatDate(date) {
  return date.toISOString().slice(0, -5).replace('T', ' ');
}

/**
 * Check if AWS CLI is available
 */
async function checkAwsCli() {
  try {
    await execPromise('aws --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if AWS credentials are configured
 */
async function checkAwsCredentials() {
  try {
    await execPromise('aws sts get-caller-identity');
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate S3 bucket name
 */
function validateBucketName(name) {
  // S3 bucket naming rules
  const pattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
  
  if (!pattern.test(name)) {
    return false;
  }
  
  if (name.length < 3 || name.length > 63) {
    return false;
  }
  
  if (name.includes('..')) {
    return false;
  }
  
  return true;
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Safe file deletion
 */
function safeDelete(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get OpenClaw directory
 */
function getOpenClawDir() {
  const homedir = require('os').homedir();
  return path.join(homedir, '.openclaw');
}

/**
 * Check if OpenClaw is installed
 */
function checkOpenClawInstalled() {
  return fs.existsSync(getOpenClawDir());
}

module.exports = {
  loadConfig,
  saveConfig,
  getInstanceId,
  getRegion,
  formatBytes,
  formatDate,
  checkAwsCli,
  checkAwsCredentials,
  validateBucketName,
  ensureDir,
  safeDelete,
  getOpenClawDir,
  checkOpenClawInstalled
};
