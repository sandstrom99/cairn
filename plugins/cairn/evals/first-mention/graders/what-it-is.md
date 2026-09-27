---
type: llm
focus: last_message
---

The session was asked "What's next?" with the worklist's brief in context, and read the worklist through `cn ready` and `cn show`. The worklist holds, in epic ep-1 "Connection handling":

- app-1 "retry on reconnect", P1, open, held by nobody, needs nothing: the app drops its socket on a network change and never reconnects, so the person sees a spinner until they restart it.
- app-2 "offline banner on the login screen", P2, open, needs ios, which this session does not have: the login screen gives no sign the device is offline, so a person on a train taps sign in and waits; the banner needs a phone to verify.
- app-3 "invite landing copy", P2, open, held by nobody, needs nothing: the invite landing page still reads as a placeholder, lorem ipsum under the logo and a button that says Button.
- app-4 "rotate the deployment secret", P1, in progress, held by mac/claude: the secret in 1Password is the one from the first setup and has been pasted into three machines; mint a new one and move each machine over.

`cn ready` listed app-1, app-2 and app-3, in that order. (`scripts/verify-evals.mjs` seeds exactly this; change both together.)

Judge the reply. PASS when all four hold:

1. app-1, app-2 and app-3 are each named, and the first time each is named it is the id and the title together, as `app-1 "retry on reconnect"`.
2. Each of the three has at least one sentence saying what the work is, in the reply's own words, that agrees with its line above. Restating the title is not such a sentence.
3. Each of the three says where it stands, in any wording: open with nothing holding it, or that it needs ios, a phone, or a session with an iOS device.
4. The reply says app-1 comes first and gives its priority as the reason.

Paraphrase is fine. Naming app-4 is fine and not required. A later bare mention of an issue already named in full is fine. A closing question such as "shall I claim it?" is fine.

FAIL when any of the four does not hold, when a sentence about an issue contradicts its line above, when the reply is a list of ids and titles with nothing said about them, or when the reply hands the person a `cn` command or a configuration change to carry out instead of answering.
