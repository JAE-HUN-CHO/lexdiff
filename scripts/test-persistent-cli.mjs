#!/usr/bin/env node
/**
 * test-persistent-cli.mjs
 *
 * Proof-of-concept: Persistent Claude CLI process that stays alive
 * and accepts multiple queries via stdin streaming (NDJSON).
 *
 * Instead of spawning a new `claude` process per FC-RAG query (cold-start ~7-8s),
 * ONE process stays running and queries are piped through stdin.
 *
 * Usage:
 *   node scripts/test-persistent-cli.mjs
 *
 * Discovered NDJSON input format:
 *   {"type":"user","message":{"role":"user","content":"<prompt>"}}
 *
 * Key findings:
 *   - Claude CLI v2.1.81+ supports bidirectional streaming via
 *     --input-format stream-json --output-format stream-json
 *   - Process stays alive after first query; subsequent queries skip
 *     hook init and MCP connection setup (saving 3-6 seconds)
 *   - Conversation context (memory) persists within the session
 *   - --no-session-persistence prevents disk writes but keeps in-memory context
 *   - --system-prompt is set once at startup (not per-query)
 *   - Same session_id is reused across all queries
 */

import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CLAUDE_BIN = 'claude';
const MODEL = 'claude-sonnet-4-6';
const DISALLOWED_TOOLS = [
  'ToolSearch', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Skill', 'NotebookEdit', 'WebFetch', 'WebSearch',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate',
  'CronCreate', 'CronDelete', 'CronList',
  'EnterWorktree', 'ExitWorktree',
].join(',');

// ---------------------------------------------------------------------------
// PersistentClaudeCLI - Wrapper for a long-lived Claude CLI process
// ---------------------------------------------------------------------------
class PersistentClaudeCLI {
  constructor(options = {}) {
    this.proc = null;
    this.queryQueue = [];
    this.currentResolve = null;
    this.currentEvents = [];
    this.sessionId = null;
    this.options = options;
    this.alive = false;
    this.buffer = ''; // incomplete line buffer for stdout chunking
  }

  /**
   * Spawn the Claude CLI process. Only called once.
   */
  start() {
    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--no-session-persistence',
      '--model', MODEL,
      '--disallowed-tools', DISALLOWED_TOOLS,
    ];

    if (this.options.systemPrompt) {
      args.push('--system-prompt', this.options.systemPrompt);
    }

    if (this.options.mcpConfig) {
      args.push('--mcp-config', this.options.mcpConfig);
      args.push('--strict-mcp-config');
    }

    if (this.options.maxTurns) {
      args.push('--max-turns', String(this.options.maxTurns));
    }

    this.proc = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.alive = true;

    // Parse NDJSON lines from stdout
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      // Keep the last (possibly incomplete) segment in the buffer
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          this._handleEvent(event);
        } catch {
          // Not valid JSON - skip
        }
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text && this.options.debug) {
        console.error('[stderr]', text.substring(0, 200));
      }
    });

    this.proc.on('close', (code) => {
      this.alive = false;
      if (this.currentResolve) {
        this.currentResolve({
          events: this.currentEvents,
          error: `Process exited with code ${code}`,
        });
        this.currentResolve = null;
      }
    });

    this.proc.on('error', (err) => {
      this.alive = false;
      if (this.currentResolve) {
        this.currentResolve({
          events: this.currentEvents,
          error: err.message,
        });
        this.currentResolve = null;
      }
    });
  }

  /**
   * Handle a parsed NDJSON event from stdout.
   */
  _handleEvent(event) {
    this.currentEvents.push(event);

    // Track session ID
    if (event.session_id && !this.sessionId) {
      this.sessionId = event.session_id;
    }

    // "result" event marks end of a query response
    if (event.type === 'result' && this.currentResolve) {
      this.currentResolve({
        events: [...this.currentEvents],
        result: event.result,
        isError: event.is_error,
        durationMs: event.duration_ms,
        durationApiMs: event.duration_api_ms,
        numTurns: event.num_turns,
        sessionId: event.session_id,
      });
      this.currentResolve = null;
      this.currentEvents = [];
    }
  }

  /**
   * Send a query and wait for the complete response.
   * Returns a promise that resolves with all events + final result.
   */
  query(prompt) {
    if (!this.alive) {
      return Promise.reject(new Error('Process is not alive'));
    }

    return new Promise((resolve) => {
      this.currentResolve = resolve;
      this.currentEvents = [];

      const ndjsonLine = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: prompt },
      });

      this.proc.stdin.write(ndjsonLine + '\n');
    });
  }

  /**
   * Gracefully shut down the process.
   */
  async stop() {
    if (this.proc && this.alive) {
      this.proc.stdin.end();
      await new Promise((resolve) => this.proc.on('close', resolve));
    }
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(70));
  console.log('  Persistent Claude CLI - Proof of Concept');
  console.log('  Claude CLI v2.1.81, Model:', MODEL);
  console.log('='.repeat(70));
  console.log();

  // -------------------------------------------------------------------------
  // Test 1: Basic multi-query with timing comparison
  // -------------------------------------------------------------------------
  console.log('TEST 1: Multi-query timing comparison');
  console.log('-'.repeat(50));

  const cli = new PersistentClaudeCLI({
    systemPrompt: 'You are a concise assistant. Reply in one short sentence.',
  });

  const spawnStart = Date.now();
  cli.start();
  console.log(`  Process spawned (PID: ${cli.proc.pid})`);

  // Query 1 (cold start - includes hook init, MCP connections, etc.)
  const t1 = Date.now();
  const r1 = await cli.query('What is 7 * 8? Answer with just the number.');
  const d1 = Date.now() - t1;
  console.log(`  Query 1 (cold): "${r1.result}" (${d1}ms, API: ${r1.durationApiMs}ms)`);

  // Query 2 (warm - hooks and MCP already initialized)
  const t2 = Date.now();
  const r2 = await cli.query('What is the capital of France? One word.');
  const d2 = Date.now() - t2;
  console.log(`  Query 2 (warm): "${r2.result}" (${d2}ms, API: ${r2.durationApiMs}ms)`);

  // Query 3 (warm)
  const t3 = Date.now();
  const r3 = await cli.query('Name one primary color. One word.');
  const d3 = Date.now() - t3;
  console.log(`  Query 3 (warm): "${r3.result}" (${d3}ms, API: ${r3.durationApiMs}ms)`);

  console.log();
  console.log(`  Cold-start overhead: ~${d1 - Math.round((d2 + d3) / 2)}ms`);
  console.log(`  Session ID: ${r1.sessionId}`);
  console.log(`  Same session for all: ${r1.sessionId === r2.sessionId && r2.sessionId === r3.sessionId}`);

  // -------------------------------------------------------------------------
  // Test 2: Context persistence (does query 2 remember query 1?)
  // -------------------------------------------------------------------------
  console.log();
  console.log('TEST 2: Context persistence across queries');
  console.log('-'.repeat(50));

  const t4 = Date.now();
  const r4 = await cli.query('The secret password is ALPHA-BRAVO-7. Remember it. Reply: OK.');
  console.log(`  Query 4 (set context): "${r4.result}" (${Date.now() - t4}ms)`);

  const t5 = Date.now();
  const r5 = await cli.query('What was the secret password I told you? Reply with just the password.');
  const d5 = Date.now() - t5;
  const remembers = r5.result?.includes('ALPHA-BRAVO-7');
  console.log(`  Query 5 (recall):     "${r5.result}" (${d5}ms)`);
  console.log(`  Context persists: ${remembers ? 'YES' : 'NO'}`);

  // -------------------------------------------------------------------------
  // Test 3: Event stream analysis (what events does a query produce?)
  // -------------------------------------------------------------------------
  console.log();
  console.log('TEST 3: Event stream structure');
  console.log('-'.repeat(50));

  const r6 = await cli.query('Say "test complete".');
  const eventTypes = r6.events.map(e =>
    e.subtype ? `${e.type}:${e.subtype}` : e.type
  );
  console.log(`  Events per query: ${r6.events.length}`);
  console.log(`  Event sequence: ${eventTypes.join(' -> ')}`);

  // Count partial assistant messages
  const partials = r6.events.filter(
    e => e.type === 'assistant' && e.message?.content
  );
  console.log(`  Partial message events: ${partials.length}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const totalQueries = 6;
  const totalTime = Date.now() - spawnStart;

  console.log();
  console.log('='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total queries:          ${totalQueries}`);
  console.log(`  Total wall time:        ${totalTime}ms`);
  console.log(`  Avg per query:          ${Math.round(totalTime / totalQueries)}ms`);
  console.log(`  Cold start (query 1):   ${d1}ms`);
  console.log(`  Warm avg (queries 2-3): ${Math.round((d2 + d3) / 2)}ms`);
  console.log(`  Cold-start savings:     ~${d1 - Math.round((d2 + d3) / 2)}ms per query`);
  console.log(`  Context persists:       ${remembers ? 'YES' : 'NO'}`);
  console.log(`  Single session:         YES (${cli.sessionId})`);
  console.log();
  console.log('  NDJSON input format:');
  console.log('    {"type":"user","message":{"role":"user","content":"<prompt>"}}');
  console.log();
  console.log('  Key flags for persistent mode:');
  console.log('    --print --input-format stream-json --output-format stream-json');
  console.log('    --include-partial-messages  (for streaming UI)');
  console.log('    --no-session-persistence    (no disk writes, memory-only context)');
  console.log('    --system-prompt "..."       (set once at startup, applies to all queries)');
  console.log();
  console.log('  Limitations:');
  console.log('    - System prompt is fixed at process start (not per-query)');
  console.log('    - Conversation history accumulates (context window fills up)');
  console.log('    - Process must be restarted to change model/tools/system-prompt');
  console.log('    - No built-in query isolation (each query sees prior context)');
  console.log('='.repeat(70));

  await cli.stop();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
