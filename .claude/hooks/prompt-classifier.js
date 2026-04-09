#!/usr/bin/env node

// This script runs automatically every time you submit a prompt in Claude Code.
// It reads your message, checks if it looks like a bug fix or a new feature,
// and if so, injects the matching command template as extra context for Claude.
// That way Claude already knows how to approach the task before it reads your prompt.
// If your message is a question or doesn't match either type, it does nothing.

import { readFileSync } from 'fs';
import { join } from 'path';

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const prompt = (input.prompt || '').toLowerCase().trim();

// Skip questions — don't inject a workflow for informational prompts
const isQuestion = /^(what|how|why|can|could|does|do|is|are|explain|tell me|show me|where|when|who|which|should)/.test(prompt);
if (isQuestion) process.exit(0);

// Classify as fix or feature
function classify(text) {
  if (/\b(fix|bug|broken|not working|doesn't work|won't work|issue|error|crash|wrong|failing|breaks|broke)\b/.test(text)) return 'fix';
  if (/\b(build|create|implement|add|new feature|end to end|end-to-end|include|append|make|redesign|rework)\b/.test(text)) return 'feature';
  return null;
}

const type = classify(prompt);
if (!type) process.exit(0);

// Load the matching command template from .claude/commands/
const commandPath = join(process.cwd(), '.claude', 'commands', `${type}.md`);
let template;
try {
  template = readFileSync(commandPath, 'utf8').replace(/\$ARGUMENTS\n?/g, '').trim();
} catch {
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    additionalContext: `[Auto-detected task type: ${type}]\n\n${template}`
  }
}));
