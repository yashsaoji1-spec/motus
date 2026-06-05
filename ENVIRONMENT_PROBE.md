# Environment Probe — 2026-05-22

## 1. `node --version`
```
v22.22.2
```

## 2. `npm --version`
```
10.9.7
```

## 3. `java -version 2>&1 || echo 'Java not found'`
```
openjdk version "21.0.10" 2026-01-20
OpenJDK Runtime Environment (build 21.0.10+7-Ubuntu-124.04)
OpenJDK 64-Bit Server VM (build 21.0.10+7-Ubuntu-124.04, mixed mode, sharing)
```

## 4. `which firebase || echo 'firebase CLI not found'`
```
firebase CLI not found
```
(No global `firebase` binary. Not in PATH.)

## 5. `npx firebase --version 2>&1 | head -5`
```
npm error could not determine executable to run
npm notice New major version of npm available! 10.9.7 -> 11.15.0
```
(`firebase-tools` is not installed locally in `node_modules`, so `npx` cannot run it.)

## 6. `which playwright || echo 'playwright not found'`
```
/opt/node22/bin/playwright
```
(A `playwright` binary exists at this path — it is the system-installed Playwright CLI.)

## 7. `npx playwright --version 2>&1 || echo 'playwright not available'`
```
Version 1.56.1
```
(System Playwright version is 1.56.1. Note: `package.json` devDependency requests `^1.59.1`.)

## 8. `apt list --installed 2>/dev/null | grep -i chrom || echo 'no chromium package found'`
```
no chromium package found
```

## 9. `which google-chrome || which chromium || which chromium-browser || echo 'no browser binary found'`
```
no browser binary found
```
(No Chrome/Chromium binary on PATH. Browsers are installed under `/opt/pw-browsers` — see below.)

## 10. `cat /etc/os-release 2>/dev/null | head -5`
```
PRETTY_NAME="Ubuntu 24.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.4 LTS (Noble Numbat)"
VERSION_CODENAME=noble
```

## 11. `uname -a`
```
Linux vm 6.18.5 #2 SMP PREEMPT_DYNAMIC Wed Jan 14 17:56:08 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux
```

## 12. `free -h`
```
               total        used        free      shared  buff/cache   available
Mem:            15Gi       599Mi        14Gi       4.2Mi       617Mi        15Gi
Swap:             0B          0B          0B
```

## 13. `nproc`
```
4
```

## 14. `df -h / | head -3`
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda        252G  7.1G   30G  20% /
```

## 15. `ls package.json && npm ci --ignore-scripts 2>&1 | tail -5`
```
package.json
[... audit warnings ...]
To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```
(`npm ci` completed successfully — packages installed into `node_modules/`. Audit warnings are present but non-blocking.)

## 16. `npx firebase emulators:exec --only firestore,auth 'echo emulators-work' 2>&1 | tail -20`
```
npm error could not determine executable to run
```
(`firebase-tools` is not in `node_modules/` and not installed globally, so the Firebase Emulators cannot be launched. Both `test:rules` and `test:e2e` npm scripts will fail as written.)

## 17. `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium 2>&1 | tail -10`
```
    at IncomingMessage.handleError (...)
    at IncomingMessage.emit (node:events:531:35)
    at endReadableNT (node:internal/streams/readable:1698:12)
    at process.processTicksAndRejections (...)
Failed to install browsers
Error: Failed to download Chrome for Testing 147.0.7727.15 (playwright chromium v1217), caused by
Error: Download failure, code=1
```
(Download of Chromium v1217 failed — network access to browser CDN is blocked. `PLAYWRIGHT_BROWSERS_PATH=0` was used to bypass the env var, but the download still failed.)

## 18. `git branch --show-current`
```
main
```

## 19. `ls -la` (repo root)
```
total 364
drwxr-xr-x  16 root root   4096 May 22 00:00 .
drwxr-xr-x   3 root root   4096 May 21 23:59 ..
drwxr-xr-x   5 root root   4096 May 21 23:59 .claude
-rw-r--r--   1 root root    609 May 21 23:59 .env.e2e
-rw-r--r--   1 root root    364 May 21 23:59 .env.example
drwxr-xr-x   2 root root   4096 May 21 23:59 .firebase
-rw-r--r--   1 root root     52 May 21 23:59 .firebaserc
drwxr-xr-x   8 root root   4096 May 21 23:59 .git
drwxr-xr-x   3 root root   4096 May 21 23:59 .github
-rw-r--r--   1 root root    240 May 21 23:59 .gitignore
-rw-r--r--   1 root root     22 May 21 23:59 .npmrc
-rw-r--r--   1 root root  12292 May 21 23:59 CLAUDE.md
-rw-r--r--   1 root root   6997 May 21 23:59 TODO.md
drwxr-xr-x   4 root root   4096 May 21 23:59 android
drwxr-xr-x   2 root root   4096 May 21 23:59 angle_tracking
-rw-r--r--   1 root root     73 May 21 23:59 capacitor.config.json
drwxr-xr-x   4 root root   4096 May 21 23:59 code
drwxr-xr-x   3 root root   4096 May 21 23:59 docs
-rw-r--r--   1 root root   1685 May 21 23:59 firebase.json
-rw-r--r--   1 root root   1888 May 21 23:59 firestore.indexes.json
-rw-r--r--   1 root root  12048 May 21 23:59 firestore.rules
drwxr-xr-x   2 root root   4096 May 21 23:59 functions
drwxr-xr-x 238 root root  12288 May 22 00:00 node_modules
-rw-r--r--   1 root root 210433 May 21 23:59 package-lock.json
-rw-r--r--   1 root root   1160 May 21 23:59 package.json
-rw-r--r--   1 root root    687 May 21 23:59 playwright.config.js
drwxr-xr-x   2 root root   4096 May 21 23:59 public
drwxr-xr-x   2 root root   4096 May 21 23:59 scripts
drwxr-xr-x   4 root root   4096 May 21 23:59 tests
-rw-r--r--   1 root root    425 May 21 23:59 vite.config.mjs
-rw-r--r--   1 root root    158 May 21 23:59 vitest.config.js
```

## 20. `env | grep -i 'PATH\|HOME\|NODE' | head -10`
```
NODE_OPTIONS=--max-old-space-size=8192
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
PWD=/home/user/motus
NoDefaultCurrentDirectoryInExePath=1
HOME=/root
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUSTUP_HOME=/root/.rustup
CLAUDE_CODE_EXECPATH=/opt/claude-code/bin/claude
PATH=/root/.local/bin:/root/.cargo/bin:/usr/local/go/bin:/opt/node22/bin:/opt/maven/bin:/opt/gradle/bin:/opt/rbenv/bin:/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

---

## Additional observations

### Pre-installed Playwright browsers at `/opt/pw-browsers`
```
chromium          (symlink marker)
chromium-1194/    (chrome-linux/ binary present — INSTALLATION_COMPLETE marker present)
chromium_headless_shell-1194/
ffmpeg-1011/
```
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set in the environment. Chromium **v1194** is pre-installed here. However, the local `@playwright/test` devDependency in `package.json` is `^1.59.1`, which requires Chromium **v1217**. The system Playwright CLI at `/opt/node22/bin/playwright` is version **1.56.1**, which matches v1194.

**Version mismatch summary:**
- Pre-installed Chromium: v1194 (matches Playwright 1.52.x–1.55.x range)
- System `playwright` CLI: 1.56.1 (needs ~v1197 or compatible)
- `package.json` requests: `@playwright/test ^1.59.1` (needs v1217)
- Downloading v1217 **fails** (CDN blocked by network policy)

### Firebase emulators
`firebase-tools` is **not** installed (neither globally nor locally). Both test scripts (`test:rules`, `test:e2e`) depend on `firebase emulators:exec` and will fail until `firebase-tools` is added as a devDependency or installed globally.

### package.json `test` script
```json
"test": "echo \"Error: no test specified\" && exit 1"
```
No default test runner is wired up.
