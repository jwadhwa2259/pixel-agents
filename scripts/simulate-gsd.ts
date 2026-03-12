#!/usr/bin/env npx tsx
/**
 * Simulates a GSD workflow producing multiple sub-agents.
 *
 * Creates a NEW JSONL file in the project's Claude directory.
 * The extension's project scan detects the new file (~1s) and
 * reassigns the active Pixel Agents agent to it (like a /clear).
 *
 * Usage:
 *   1. Rebuild extension: npm run build
 *   2. Open Extension Dev Host (F5) and click "+ Agent"
 *   3. Run from a separate terminal: npx tsx scripts/simulate-gsd.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Find the Claude projects directory the extension is actually watching.
// Scan all project dirs for the one with the most recently modified JSONL file.
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
let claudeDir: string;

if (process.argv[2]) {
  // Explicit path to a JSONL file or directory
  claudeDir = fs.statSync(process.argv[2]).isDirectory()
    ? process.argv[2]
    : path.dirname(process.argv[2]);
} else {
  // Auto-detect: find the project dir with the most recently modified JSONL
  let bestDir = '';
  let bestMtime = 0;
  try {
    for (const dir of fs.readdirSync(projectsRoot)) {
      const full = path.join(projectsRoot, dir);
      if (!fs.statSync(full).isDirectory()) continue;
      for (const f of fs.readdirSync(full).filter((f) => f.endsWith('.jsonl'))) {
        const mt = fs.statSync(path.join(full, f)).mtimeMs;
        if (mt > bestMtime) {
          bestMtime = mt;
          bestDir = full;
        }
      }
    }
  } catch {
    /* ignore */
  }
  if (!bestDir) {
    console.error('No JSONL files found. Create an agent in Pixel Agents first.');
    process.exit(1);
  }
  claudeDir = bestDir;
}

console.log(`Target project dir: ${claudeDir}`);

// Create a fresh JSONL file with a new UUID — the extension's project scan will detect it
const sessionId = crypto.randomUUID();
const jsonlPath = path.join(claudeDir, `${sessionId}.jsonl`);

console.log(`Creating simulated GSD session: ${path.basename(jsonlPath)}`);
console.log(`Directory: ${claudeDir}`);

function append(record: Record<string, unknown>) {
  fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n');
}

function toolId() {
  return 'toolu_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GSD sub-agent definitions to simulate
const subagents = [
  {
    description: 'Research phase requirements',
    prompt:
      'Research how to implement Phase 3. Investigate existing patterns, dependencies, and constraints.',
    subagent_type: 'gsd-phase-researcher',
    tools: [
      { name: 'Read', input: { file_path: '/Users/jaywadhwa/pixel-agents/src/extension.ts' } },
      { name: 'Grep', input: { pattern: 'agent', path: '/Users/jaywadhwa/pixel-agents/src' } },
      { name: 'Read', input: { file_path: '/Users/jaywadhwa/pixel-agents/src/types.ts' } },
    ],
  },
  {
    description: 'Plan phase implementation',
    prompt:
      'Create a detailed plan for Phase 3 implementation. Plan task breakdown and dependencies.',
    subagent_type: 'gsd-planner',
    tools: [
      { name: 'Read', input: { file_path: '/Users/jaywadhwa/pixel-agents/package.json' } },
      { name: 'Write', input: { file_path: '/tmp/plan.md', content: '# Plan' } },
    ],
  },
  {
    description: 'Execute phase tasks',
    prompt: 'Execute the plan for Phase 3. Implement the changes described in PLAN.md.',
    subagent_type: 'gsd-executor',
    tools: [
      {
        name: 'Edit',
        input: {
          file_path: '/Users/jaywadhwa/pixel-agents/src/extension.ts',
          old_string: 'a',
          new_string: 'b',
        },
      },
      { name: 'Bash', input: { command: 'npm run build' } },
      { name: 'Write', input: { file_path: '/tmp/output.ts', content: 'done' } },
    ],
  },
  {
    description: 'Verify phase completion',
    prompt: 'Verify that Phase 3 was implemented correctly. Check verification criteria and UAT.',
    subagent_type: 'gsd-verifier',
    tools: [
      { name: 'Bash', input: { command: 'npm test' } },
      { name: 'Read', input: { file_path: '/Users/jaywadhwa/pixel-agents/src/extension.ts' } },
    ],
  },
];

async function simulate() {
  // Write an initial user prompt so the file has content when detected
  append({
    type: 'user',
    message: {
      type: 'message',
      role: 'user',
      content: 'Execute Phase 3 of the GSD roadmap.',
    },
  });

  console.log('\nWaiting 3s for extension to detect the new JSONL file...');
  await sleep(3000);

  // Step 1: Parent agent responds with text
  console.log('Starting GSD orchestrator...');
  append({
    type: 'assistant',
    message: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Starting GSD phase execution with parallel sub-agents...' }],
    },
  });
  await sleep(1500);

  // Step 2: Launch all 4 sub-agents at once (like GSD wave parallelization)
  const agentToolIds: string[] = [];
  const toolUseBlocks = subagents.map((sa) => {
    const tid = toolId();
    agentToolIds.push(tid);
    return {
      type: 'tool_use',
      id: tid,
      name: 'Agent',
      input: {
        description: sa.description,
        prompt: sa.prompt,
        subagent_type: sa.subagent_type,
      },
    };
  });

  console.log(`Spawning ${subagents.length} sub-agents...`);
  append({
    type: 'assistant',
    message: {
      type: 'message',
      role: 'assistant',
      content: toolUseBlocks,
    },
  });
  await sleep(2000);

  // Step 3: Simulate sub-agent progress (interleaved tool_use / tool_result)
  for (let i = 0; i < subagents.length; i++) {
    const sa = subagents[i];
    const parentTid = agentToolIds[i];

    for (const tool of sa.tools) {
      const subToolId = toolId();

      // Sub-agent assistant message with tool_use
      console.log(`  [${sa.description}] → ${tool.name}`);
      append({
        type: 'progress',
        parentToolUseID: parentTid,
        data: {
          type: 'agent_progress',
          message: {
            type: 'assistant',
            message: {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: subToolId,
                  name: tool.name,
                  input: tool.input,
                },
              ],
            },
          },
        },
      });
      await sleep(1200);

      // Sub-agent user message with tool_result
      append({
        type: 'progress',
        parentToolUseID: parentTid,
        data: {
          type: 'agent_progress',
          message: {
            type: 'user',
            message: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: subToolId,
                  content: 'OK',
                },
              ],
            },
          },
        },
      });
      await sleep(800);
    }
  }

  // Step 4: All Agent tools complete
  console.log('\nAll sub-agents completing...');
  await sleep(1000);
  append({
    type: 'user',
    message: {
      type: 'message',
      role: 'user',
      content: agentToolIds.map((tid) => ({
        type: 'tool_result',
        tool_use_id: tid,
        content: 'Sub-agent completed successfully.',
      })),
    },
  });

  await sleep(2000);

  // Step 5: Turn ends
  console.log('GSD workflow complete — turn ending...');
  append({
    type: 'system',
    subtype: 'turn_duration',
    duration_ms: 45000,
    duration_api_ms: 40000,
  });

  console.log('\nDone! You should have seen 4 sub-agent characters:');
  console.log('  Researcher (blue) — Read, Grep, Read');
  console.log('  Planner (green) — Read, Write');
  console.log('  Executor (orange) — Edit, Bash, Write');
  console.log('  Verifier (purple) — Bash, Read');
  console.log(`\nCleanup: rm "${jsonlPath}"`);
}

simulate().catch(console.error);
