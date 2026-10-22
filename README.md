# CSC 451 public demo

Static, browser-only exam practice. AI is removed for public demonstration.

- No login, backend, API calls, analytics, or account data.
- No localStorage, sessionStorage, cookies, IndexedDB, or service worker.
- Answers, generated examples, bookmarks, and edits exist only in JavaScript memory in the current tab. Refreshing resets everything.
- Short answers use model-answer self-checks. Multiple choice, recall, calculation variants, metrics lessons, and interactive backpropagation remain available.

Serve `dist/` with any static web server. Do not upload private account files, archives, reports, or credentials. This branch is a separate root commit so its history contains only public demo files.

## Verification

The browser smoke test checks quiz answers, self-check short answers, backpropagation inputs and navigation, refresh reset, mobile layout, zero persistent-storage access, and zero API calls.

## Deployment

The live demo uses the existing Caddy instance at `testprep.pauljrobinsonjr.com`. `deploy/publish.py` replaces only that hostname's route, preserving other domains and the existing Foundry download. It stores private rollback files outside the public asset directory and stops the old AI app without deleting account data or credentials.

Upload an archive containing this branch's `dist/` folder as `/srv/tempered/testprep/public-demo.tar.gz`, then run the publish script on the box with the Git commit as its argument. The existing private `compose.yaml`, account data, and auth directories are not overwritten.
