#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// Find the hook script — use tsx to run it from the package
function getHookCommand(): string {
  // When installed via npm, use the package's hook script
  const pkgHook = path.join(__dirname, '..', 'hook', 'index.js');
  if (fs.existsSync(pkgHook)) {
    return `node ${pkgHook}`;
  }
  // Dev mode: use tsx
  const devHook = path.join(__dirname, '..', '..', 'src', 'hook', 'index.ts');
  if (fs.existsSync(devHook)) {
    const tsxPath = execSync('which tsx', { encoding: 'utf8' }).trim();
    return `${tsxPath} ${devHook}`;
  }
  throw new Error('Cannot find hook script. Run npm build first.');
}

function main(): void {
  console.log('cc-taskboard: configuring Claude Code hook...');

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch {
      console.error('Error: Could not parse ~/.claude/settings.json');
      process.exit(1);
    }
  }

  const hookCommand = getHookCommand();
  const hookEntry = {
    matcher: 'Task(Create|Update|Stop|Get|Output|List)|Agent',
    hooks: [{ type: 'command', command: hookCommand }],
  };

  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  const postToolUse = (hooks.PostToolUse as object[]) ?? [];

  // Remove any existing cc-taskboard hook entries
  const filtered = postToolUse.filter((h: unknown) => {
    const entry = h as { hooks?: { command?: string }[] };
    return !entry.hooks?.some((hk) => hk.command?.includes('cc-taskboard'));
  });

  filtered.push(hookEntry);
  hooks.PostToolUse = filtered;
  settings.hooks = hooks;

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log(`✓ Hook installed: ${hookCommand}`);
  console.log('✓ Restart Claude Code to activate.');
  console.log('\nNext: claude mcp add cc-taskboard --command "npx cc-taskboard"');
}

main();
