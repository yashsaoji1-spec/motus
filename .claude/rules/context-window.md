# Context Window Rules

**Tool hierarchy — use in this order:**
1. `ctx_batch_execute` — primary research tool. Multiple commands/reads/searches in one call, auto-indexed.
2. `ctx_search` — all follow-up questions. One call, multiple queries.
3. `ctx_execute` / `ctx_execute_file` — API calls, log analysis, large file processing.

**Hard rules:**
- Bash only for commands producing <20 lines — otherwise use `ctx_execute`
- Never use Read for analysis — use `ctx_execute_file` (Read only when you need content in context to Edit)
- Never use WebFetch — use `ctx_fetch_and_index`

**Session hygiene:**
- Suggest `/clear` when switching to an unrelated task — stale context is wasted tokens
- Never ask the user to paste code into chat — reference the file path and read it directly
