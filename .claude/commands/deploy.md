Deploy Motus to Firebase.

Before doing anything:
1. Run `git branch` and confirm we are NOT on main — stop and ask if we are
2. Run `git status` — if there are uncommitted changes, list them and ask whether to commit first

Then deploy:
1. `npm run build`
2. `~/.npm-global/bin/firebase deploy --only hosting`
3. Confirm the deploy succeeded and print the live URL
