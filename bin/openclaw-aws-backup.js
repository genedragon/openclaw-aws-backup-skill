#!/usr/bin/env node
const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { spawn } = require('child_process');

const program = new Command();

program
  .name('openclaw-aws-backup')
  .description('Secure backup and restore for OpenClaw')
  .version('2.0.0');

program
  .command('setup')
  .description('Run interactive setup wizard')
  .action(() => {
    runScript('setup.js');
  });

program
  .command('create')
  .description('Create a new backup')
  .action(() => {
    runScript('backup-create.js');
  });

program
  .command('restore')
  .description('Restore from backup')
  .action(() => {
    runScript('backup-restore.js');
  });

program
  .command('list')
  .description('List available backups')
  .action(() => {
    runScript('backup-list.js');
  });

program
  .command('test')
  .description('Run backup test suite')
  .action(() => {
    runScript('backup-test.js');
  });

function runScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const child = spawn('node', [scriptPath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

program.parse();
