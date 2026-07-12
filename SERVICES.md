# Motus — Services We Use

Every outside service Motus depends on, in plain terms — what it does and why it's here.

> No passwords or keys live in this file or the repo. Those stay in each service's
> dashboard and in local `.env` files (which are not committed).

| Service | What it does |
|---|---|
| **Firebase / Google Cloud** | Runs the whole app — hosts the website, handles logins + email verification, stores the database, keeps session videos secure, and runs background jobs (data cleanup, account deletion). |
| **Namecheap** | Owns the domain `motusmedicine.com` and its DNS settings. |
| **Zoho Mail** | The email inboxes: `yash@`, `support@`, `privacy@` `motusmedicine.com`. |
| **Google Analytics (GA4)** | Tracks how people use the app — visits and activity. |
| **reCAPTCHA** | Blocks bots (powers Firebase's App Check security). |
| **Sentry** | Tracks errors/crashes so we know when something breaks. |
| **UptimeRobot** | Tracks whether the site is up; emails an alert if it goes down. |
| **GitHub** | Stores the code (`github.com/yashsaoji1-spec/motus`). |

**Email specifics:** verification/reset emails send from `noreply@motusmedicine.com`
(via Firebase); everything else (`support@`, etc.) is Zoho. Both share one SPF DNS
record so neither breaks the other.

**Not in use:** Resend (email — evaluated, turned off, it conflicted with the above),
Higgsfield (tried for a promo video), IONOS (considered for the domain, went Namecheap).

**Configuration:** app settings live in gitignored `.env` files (`.env.production`,
`.env.staging`, etc.) — Firebase keys, the reCAPTCHA key, the Sentry address, and the
GA4 ID. Values are secret; the repo only references their names.
