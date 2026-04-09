Push changes to the current branch: $ARGUMENTS

Before doing anything:
1. Run `git branch` and confirm we are NOT on main — stop and ask if we are
2. Run `git status` to see what's staged, unstaged, and untracked

Then:
1. Stage the relevant files (ask if unclear which files to include)
2. Commit with a clear message describing what changed
3. Push to the current branch — never main unless explicitly told to
4. Confirm the push succeeded with `git log --oneline -3`
