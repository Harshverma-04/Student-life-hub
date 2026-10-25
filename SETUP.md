# Student Life Hub — Setup guide (read this first)

This project is a GitHub Pages frontend connected to Supabase for Google OAuth, database records and private PDF storage. The repository is public, so **never put passwords, service-role keys, or other secrets in it**.

## What is included
- Responsive website and student tools
- Google sign-in integration
- Notes search and PDF viewer links
- Admin-only upload/delete interface
- Supabase SQL schema and Row Level Security policies
- Basic About, Contact, Privacy and Terms pages

## Part A — Create Supabase project
1. Create a project at https://supabase.com/ and save its database password somewhere private.
2. Open **Project Settings → API** (or Connect/API keys) and copy the **Project URL** and the **publishable key** or legacy `anon` key.
3. Open `config.js` and replace the two `PASTE_...` placeholders.
   - These browser values are designed to be public.
   - NEVER paste the `service_role`, secret, database password, or OAuth client secret into `config.js` or GitHub.
4. In Supabase **SQL Editor**, run all SQL from `supabase/schema.sql`.

## Part B — Set up Google sign-in
1. In Google Cloud Console, create/select a project and configure the OAuth consent screen.
2. Create an OAuth client of type **Web application**.
3. In Supabase → **Authentication → Providers → Google**, enable Google and enter the Google OAuth Client ID and Client Secret. Save.
4. Copy the Supabase callback URL shown in that Google provider panel and add it as an **Authorized redirect URI** in Google Cloud. Use the exact URI shown by Supabase.
5. In Supabase → **Authentication → URL Configuration**, set the Site URL to your final GitHub Pages URL, for example `https://YOUR-USERNAME.github.io/YOUR-REPO/`. Add that URL to Redirect URLs too. Exact URL and trailing slash matter.
6. For local testing, add your local test URL only if you know the exact address you will use. Remove broad or unneeded redirect URLs before launch.

Google Cloud and Supabase screens can change; follow the current labels in their dashboards. Do not share OAuth secrets in chat or repository.

## Part C — Create the one Admin safely
1. Publish the site once and sign in with the Google account that should be the Admin.
2. In Supabase → **Authentication → Users**, find that user and copy the user's UUID (not their email).
3. In SQL Editor, run this command after replacing `PUT-USER-UUID-HERE` with the UUID:
   ```sql
   insert into public.admins (user_id)
   values ('PUT-USER-UUID-HERE')
   on conflict (user_id) do nothing;
   ```
4. Sign out and sign back in. The Admin Panel should appear for that account only.
5. Do not let a client-side page create admin records. The `admins` table has no public insert/update/delete permissions.

## Part D — Publish on GitHub Pages
1. Create a new public GitHub repository, e.g. `student-life-hub`.
2. Upload the contents of this folder to the repository root: `index.html`, `style.css`, `config.js`, `app.js`, `about.html`, `contact.html`, `privacy.html`, `terms.html`, and the `supabase` folder.
3. Commit changes.
4. Open repository **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, select `main` and `/(root)`, then Save.
5. Wait for GitHub Pages to publish. Open the exact URL GitHub provides and test Google sign-in.

## Part E — Required tests before calling it ready
- Test Google sign-in and sign-out on mobile.
- Check that an ordinary student cannot see the Admin Panel and cannot upload/delete files.
- Check that the Admin can upload a small PDF, see it listed, open it, and delete it.
- Test search and filters.
- Test the site in a signed-out/private browser window.
- Review Supabase logs for errors.
- Do not collect unnecessary personal information. Do not upload private student records, copyrighted books/notes without permission, or sensitive documents.

## Important limitations
- This starter project does not include email/password auth, student-to-student uploads, payment, notifications, or an advanced admin audit log.
- Google OAuth setup requires credentials from Google Cloud and Supabase; I cannot create these private credentials for you.
- The first Admin must be added manually in the Supabase SQL Editor after the account exists.
- GitHub Pages hosts the static frontend; Supabase provides auth, database and file storage.
- Google Search indexing and AdSense approval are separate processes and are not guaranteed. Add substantial original educational content and accurate policy pages before applying for ads.
- If you are under 18, Google AdSense requires an adult parent/guardian to handle the account according to Google's rules.
