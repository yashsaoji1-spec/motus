#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const prompt = (input.prompt || '').toLowerCase().trim();

// Skip questions — don't auto-classify informational prompts
const isQuestion = /^(what|how|why|can|could|does|do|is|are|explain|tell me|show me|where|when|who|which|should)/.test(prompt);
if (isQuestion) process.exit(0);

// Classify — order matters (most specific first)
function classify(text) {
  if (/\b(firestore|collection|document|\bdb\b|database|query|queries|pull data|fetch data|read data|write data|schema)\b/.test(text)) return 'db';
  if (/\b(fix|bug|broken|not working|doesn't work|wont work|won't work|issue|error|crash|wrong|failing|breaks|broke)\b/.test(text)) return 'fix';
  if (/\b(plan|think through|how should i|design|approach|strategy|before (building|coding|writing|implementing))\b/.test(text)) return 'plan';
  if (/\b(style|styling|look|layout|visual|color|spacing|align|centering|move the|redesign|ui change|appearance)\b/.test(text)) return 'style';
  if (/\b(build|create|implement|new feature|full feature|end to end|end-to-end)\b/.test(text)) return 'feature';
  if (/\b(add|include|append|put a|put an)\b/.test(text)) return 'add';
  return null;
}

const type = classify(prompt);
if (!type) process.exit(0);

const commandPath = join(process.cwd(), '.claude', 'commands', `${type}.md`);
let template;
try {
  template = readFileSync(commandPath, 'utf8').replace(/\$ARGUMENTS\n?/g, '').trim();
} catch {
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    additionalContext: `[Task type auto-detected: ${type}]\n\n${template}`
  }
}));
