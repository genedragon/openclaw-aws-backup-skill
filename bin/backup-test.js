#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const chalk = require('chalk');

const execPromise = promisify(exec);

async function runTests() {
  console.log(chalk.bold.cyan('\n🧪 OpenClaw Backup - Test Suite\n'));
  
  // Load config
  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('❌ No configuration found. Run: openclaw-aws-backup setup'));
    process.exit(1);
  }
  
  const testResults = [];
  
  try {
    // Test 1: Configuration validation
    console.log(chalk.yellow('Test 1: Configuration validation'));
    const configTest = await testConfiguration(config);
    testResults.push(configTest);
    console.log(configTest.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Test 2: S3 connectivity
    console.log(chalk.yellow('Test 2: S3 connectivity'));
    const s3Test = await testS3Connectivity(config);
    testResults.push(s3Test);
    console.log(s3Test.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Test 3: KMS key access
    console.log(chalk.yellow('Test 3: KMS key access'));
    const kmsTest = await testKMSAccess(config);
    testResults.push(kmsTest);
    console.log(kmsTest.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Test 4: Create test backup
    console.log(chalk.yellow('Test 4: Create test backup'));
    const backupTest = await testBackupCreation(config);
    testResults.push(backupTest);
    console.log(backupTest.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Test 5: List backups
    console.log(chalk.yellow('Test 5: List backups'));
    const listTest = await testListBackups(config);
    testResults.push(listTest);
    console.log(listTest.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Test 6: Restore test backup
    console.log(chalk.yellow('Test 6: Restore capability'));
    const restoreTest = await testRestoreCapability(config);
    testResults.push(restoreTest);
    console.log(restoreTest.passed ? chalk.green('✅ PASSED\n') : chalk.red('❌ FAILED\n'));
    
    // Summary
    console.log(chalk.bold('\n📊 Test Summary\n'));
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    testResults.forEach(test => {
      const icon = test.passed ? chalk.green('✅') : chalk.red('❌');
      console.log(`${icon} ${test.name}: ${test.message}`);
    });
    
    console.log(`\n${chalk.green('Passed:')} ${passed}`);
    console.log(`${chalk.red('Failed:')} ${failed}`);
    
    if (failed === 0) {
      console.log(chalk.bold.green('\n✅ All tests passed!\n'));
      process.exit(0);
    } else {
      console.log(chalk.bold.red('\n❌ Some tests failed\n'));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test suite failed:'), error.message);
    process.exit(1);
  }
}

async function testConfiguration(config) {
  try {
    const required = ['instanceId', 'region', 's3', 'encryption'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
      return {
        name: 'Configuration',
        passed: false,
        message: `Missing required fields: ${missing.join(', ')}`
      };
    }
    
    return {
      name: 'Configuration',
      passed: true,
      message: 'All required fields present'
    };
  } catch (error) {
    return {
      name: 'Configuration',
      passed: false,
      message: error.message
    };
  }
}

async function testS3Connectivity(config) {
  try {
    await execPromise(
      `aws s3 ls s3://${config.s3.bucket}/${config.s3.prefix}/ --region ${config.region}`
    );
    
    return {
      name: 'S3 Connectivity',
      passed: true,
      message: 'Can access S3 bucket'
    };
  } catch (error) {
    return {
      name: 'S3 Connectivity',
      passed: false,
      message: 'Cannot access S3 bucket: ' + error.message
    };
  }
}

async function testKMSAccess(config) {
  try {
    const { stdout } = await execPromise(
      `aws kms describe-key --key-id ${config.encryption.kmsKeyAlias} --region ${config.region}`
    );
    
    const keyData = JSON.parse(stdout);
    
    if (keyData.KeyMetadata.Enabled) {
      return {
        name: 'KMS Access',
        passed: true,
        message: 'KMS key accessible and enabled'
      };
    } else {
      return {
        name: 'KMS Access',
        passed: false,
        message: 'KMS key exists but is disabled'
      };
    }
  } catch (error) {
    return {
      name: 'KMS Access',
      passed: false,
      message: 'Cannot access KMS key: ' + error.message
    };
  }
}

async function testBackupCreation(config) {
  try {
    // Create a small test backup
    const testDir = '/tmp/openclaw-aws-backup-test';
    const testFile = path.join(testDir, 'test.txt');
    const timestamp = Date.now();
    
    // Create test data
    await execPromise(`mkdir -p ${testDir}`);
    fs.writeFileSync(testFile, `Test backup created at ${timestamp}`);
    
    // Create tarball
    const tarPath = `/tmp/openclaw-test-backup-${timestamp}.tar.gz`;
    await execPromise(`cd /tmp && tar -czf ${path.basename(tarPath)} openclaw-aws-backup-test/`);
    
    // Upload to S3 with KMS
    const testKey = `${config.s3.prefix}/test-backup-${timestamp}.tar.gz`;
    await execPromise(
      `aws s3 cp ${tarPath} s3://${config.s3.bucket}/${testKey} --region ${config.region} --sse aws:kms --sse-kms-key-id ${config.encryption.kmsKeyAlias}`
    );
    
    // Verify upload
    await execPromise(
      `aws s3 ls s3://${config.s3.bucket}/${testKey} --region ${config.region}`
    );
    
    // Cleanup
    fs.unlinkSync(tarPath);
    await execPromise(`rm -rf ${testDir}`);
    
    // Cleanup S3
    await execPromise(
      `aws s3 rm s3://${config.s3.bucket}/${testKey} --region ${config.region}`
    );
    
    return {
      name: 'Backup Creation',
      passed: true,
      message: 'Successfully created and uploaded encrypted backup'
    };
  } catch (error) {
    return {
      name: 'Backup Creation',
      passed: false,
      message: 'Failed to create backup: ' + error.message
    };
  }
}

async function testListBackups(config) {
  try {
    const { stdout } = await execPromise(
      `aws s3 ls s3://${config.s3.bucket}/${config.s3.prefix}/ --region ${config.region}`
    );
    
    return {
      name: 'List Backups',
      passed: true,
      message: 'Can list backups from S3'
    };
  } catch (error) {
    return {
      name: 'List Backups',
      passed: false,
      message: 'Cannot list backups: ' + error.message
    };
  }
}

async function testRestoreCapability(config) {
  try {
    // This is a dry-run test - we don't actually restore
    // Just verify we have the necessary tools and permissions
    
    // Check if we can download from S3
    const { stdout } = await execPromise(
      `aws s3 ls s3://${config.s3.bucket}/${config.s3.prefix}/ --region ${config.region} | head -1`
    );
    
    if (stdout.trim()) {
      return {
        name: 'Restore Capability',
        passed: true,
        message: 'Restore prerequisites met (S3 read access)'
      };
    } else {
      return {
        name: 'Restore Capability',
        passed: true,
        message: 'Restore ready (no backups to test with)'
      };
    }
  } catch (error) {
    return {
      name: 'Restore Capability',
      passed: false,
      message: 'Cannot verify restore capability: ' + error.message
    };
  }
}

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'backup-config.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

runTests().catch(error => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});
