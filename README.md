# 🏫 JSS Tailoring Akademi — Learning Portal

A learning platform where **lecturers publish materials and set assignments**,
and **students read, download and submit work**.

Built on **Cloudflare Pages + Workers** with **Supabase** for authentication,
database and file storage. No build step, no framework — plain HTML, CSS and
ES modules.

---

## Contents

- [What it does](#what-it-does)
- [Setup guide](#setup-guide) — get it running from scratch
  - [1. Supabase](#step-1--supabase-database--auth)
  - [2. Cloudflare Pages](#step-2--cloudflare-pages-hosting)
  - [3. First run](#step-3--first-run)
  - [Running locally](#running-locally)
- [Teaching guide](#teaching-guide) — how to actually use it
  - [For lecturers](#for-lecturers)
  - [For students](#for-students)
  - [Running a class](#running-a-class-first-week-checklist)
- [How it works](#how-it-works)
- [Admin tasks](#admin-tasks)
- [Troubleshooting](#troubleshooting)
- [Limits & roadmap](#limits--roadmap)

---

## What it does

| | Lecturer | Student |
|---|---|---|
| **Materials** | Publish typed notes and/or a file | Search, read online, download |
| **Assignments** | Create with due date and marks | Read the brief |
| **Submissions** | Review all work, grouped by assignment, flagged on-time or late | Submit text and/or a file, once per assignment |
| **Dashboard** | Live counts, recent submissions, latest materials | Outstanding work, upcoming deadlines, latest materials |

Everyone signs up with email and password and picks a role. Every page is
gated — a student who opens a lecturer URL is redirected to their own dashboard.

### Screens

```
index.html                 Landing page
login.html                 Log in / sign up

lecturer-dashboard.html    Metrics + recent activity
lecturer-materials.html    Publish a material, browse everything published
lecturer-assignments.html  Create an assignment, see submission counts
lecturer-submissions.html  All student work, grouped by assignment

student-dashboard.html     What's outstanding, what's due next
student-materials.html     Search / read / download materials
student-assignments.html   Read briefs, submit work
```

---

## Setup guide

You need a [Supabase](https://supabase.com) account and a
[Cloudflare](https://dash.cloudflare.com) account. Both are free for this.

**Roughly 15 minutes end to end.**

### Step 1 — Supabase (database + auth)

**1.1 Create the project**

Go to <https://supabase.com/dashboard> → **New project**. Pick a name and a
strong database password, and choose a region near your users. Wait for it to
finish provisioning (about a minute).

**1.2 Run the schema**

Open **SQL Editor** → **New query**. Paste the entire contents of
[`schema.sql`](schema.sql) and press **Run**.

This one script creates:

- the four tables (`profiles`, `materials`, `assignments`, `submissions`)
- a trigger that creates a profile automatically whenever someone signs up
- every Row Level Security policy
- both private storage buckets

It's safe to run more than once — re-running won't duplicate anything.

You should see **Success. No rows returned**. Check **Table Editor** and you'll
see the four tables.

**1.3 Turn off email confirmation (recommended while testing)**

**Authentication → Sign In / Providers → Email** → turn **Confirm email** off,
then Save.

Leave it on and the app still works — after signing up, users are told to check
their inbox and can log in once they've clicked the link. But for a demo or a
classroom, off is much less friction.

**1.4 Copy your keys**

**Project Settings → API keys**. You need three values:

| Value | Where it goes | Secret? |
|---|---|---|
| Project URL | `SUPABASE_URL` | No |
| `anon` / publishable key | `SUPABASE_ANON_KEY` | No — safe in the browser |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` | **Yes — never expose** |

> ⚠️ The `service_role` key bypasses Row Level Security completely. It belongs
> only in Cloudflare's encrypted Secrets, never in `public/`, never in git.

### Step 2 — Cloudflare Pages (hosting)

**Option A — connect the Git repo (recommended)**

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git**. Pick this repository.

Build settings:

| Field | Value |
|---|---|
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |

**Option B — deploy from your machine**

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy
```

`wrangler.toml` already sets the output directory, so there's nothing to pass.

**2.1 Set the environment variables**

In your Pages project: **Settings → Variables and Secrets** → add all three:

| Name | Type | Value |
|---|---|---|
| `SUPABASE_URL` | Plaintext | `https://<your-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Plaintext | your `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | your `service_role` key |

Add them to **Production**, and to **Preview** too if you use preview branches.

**Then redeploy** — environment variables are read at request time by the
Functions, but a fresh deploy is the reliable way to be sure everything picks
them up.

### Step 3 — First run

1. Visit your `*.pages.dev` URL.
2. Click **Create account**, choose **🏫 Lecturer**, and sign up.
3. You should land on the lecturer dashboard with all metrics reading `0`.

If you land back on the login page or see an error, jump to
[Troubleshooting](#troubleshooting).

### Running locally

**With Functions (matches production):**

```bash
cp .dev.vars.example .dev.vars     # then fill in your three keys
npx wrangler pages dev
```

`.dev.vars` is gitignored — keep your `service_role` key there, not in code.

**Static only (no Functions):**

```bash
npx serve public
```

In this mode `/api/config` doesn't exist, so the client falls back to the
constants at the top of `public/js/supabase-config.js` — fill those two in if
you want this path to work. File uploads fall back to a direct upload that
Row Level Security still guards.

> You must serve over HTTP. Opening the `.html` files directly with `file://`
> will not work — ES modules are blocked on that protocol.

---

## Teaching guide

How to actually run a course on it, once it's deployed.

### For lecturers

#### Publishing a material

**Learning Materials** in the sidebar. Fill in the form at the top:

| Field | Required | Notes |
|---|---|---|
| **Title** | Yes | What students see on the card |
| **Subject** | No | Shown as a tag, and searchable. Defaults to "General" |
| **Short description** | No | One line under the title |
| **Notes** | Notes *or* a file | Typed lesson content — students read it inline and can download it as `.txt` |
| **Attach a file** | Notes *or* a file | Drag & drop, or click to browse |

You must provide **notes, a file, or both** — the form won't submit with
neither. Press **Publish material** and it appears immediately below.

**Notes vs. files.** Notes are the lighter option: they render right on the
card, so students can read them without downloading anything, and they're
searchable. Use a file for anything with real formatting — a PDF handout,
slides, reference photos.

**File limits:** 20 MB, and one of these types —

```
pdf doc docx ppt pptx xls xlsx  ·  txt md csv rtf
png jpg jpeg gif webp svg       ·  zip mp4 mov mp3
```

Anything else is rejected with a clear message before the upload starts.

#### Setting an assignment

**Assignments** in the sidebar:

| Field | Required | Notes |
|---|---|---|
| **Title** | Yes | |
| **Subject** | No | Tag on the card |
| **Instructions** | Yes | The full brief — what to do, what to submit, how it's marked |
| **Due date** | No | Drives the Open/Closed badge and on-time/late flags |
| **Total marks** | No | Displayed to students |

Write the instructions as the complete brief. Students see exactly this text
and nothing else, so include the deliverable and the assessment criteria.

**A due date is worth setting.** Without one the assignment never closes, and
nothing is ever marked late. With one:

- students see **Due 2026-08-20**, and **Overdue** in red once it passes
- your card flips from **Open** to **Closed**
- every submission is stamped **On time** or **Late**

Note that a closed assignment still *accepts* submissions — the deadline is
advisory and flags late work rather than blocking it. That's usually what you
want; if you need a hard cutoff, say so in the instructions.

#### Reviewing submissions

**Submissions** in the sidebar. Four counters across the top — total
submissions, assignments set, students who submitted, late submissions — then
every assignment with its work underneath.

Each entry shows the student's name, an **On time** or **Late** badge with how
long ago it arrived, their typed answer inline, and their attachment as a
download button. Files are private: clicking mints a link that expires after
two minutes, so nothing is permanently shareable.

Your **Dashboard** is the quick daily view — the five most recent submissions,
each assignment with its live count, and your latest materials.

#### What you can't do yet

- **Grade or leave feedback.** You can read submissions, not score them.
  Marks are recorded outside the app for now.
- **Edit or delete** a material or assignment after posting. Fix a mistake by
  posting a corrected version.
- **Chase a student.** There are no notifications or emails.

### For students

**Learning Materials** lists everything your lecturers have published, newest
first. The search box filters on title, subject, description, notes and
lecturer name as you type. Each card gives you **Download file** for
attachments and **Download notes** to save the typed notes as a `.txt`.

**Assignments** shows every brief with a badge:

| Badge | Meaning |
|---|---|
| 🟡 **To do** | Not submitted yet, deadline hasn't passed |
| 🔴 **Overdue** | Not submitted, deadline has passed — you can still submit |
| 🟢 **✓ Submitted** | Turned in. Your answer and file are shown on the card |

Press **Submit work**, and in the dialog type your answer, attach a file, or
both — one of the two is required. **Esc** or clicking outside closes it
without submitting.

> **You get one submission per assignment.** It's enforced by the database, and
> there's no edit or re-submit. Check your work before pressing Submit.

Your **Dashboard** is the at-a-glance version: how much is outstanding, your
next deadlines soonest-first, and the newest materials.

### Running a class (first-week checklist)

**Before students arrive**

- [ ] Deploy and confirm you can sign up as a lecturer
- [ ] Publish 2–3 materials so the portal isn't empty on day one
- [ ] Set one low-stakes assignment with a near due date as a dry run
- [ ] Sign up a throwaway student account and submit to it, so you've seen
      both sides

**Onboarding students**

- [ ] Send them the `*.pages.dev` link
- [ ] Tell them explicitly: **choose 🎓 Student** at signup — the role can't be
      changed in the app afterwards (you'd have to fix it in SQL)
- [ ] Warn them submissions are final — one per assignment, no edits
- [ ] If you left email confirmation on, tell them to check their inbox

**Each week**

- [ ] Publish the week's notes or handout
- [ ] Post the assignment with a real due date
- [ ] Check **Submissions** after the deadline; the late counter tells you
      quickly whether the deadline worked

---

## How it works

- **Cloudflare Pages** serves `public/` from the edge.
- **Supabase** owns auth and data. The browser talks to it directly using the
  anon key, and **Row Level Security** decides what each user may read or write
  — lecturers can create materials and assignments, students can create
  submissions, and students can only ever see their own.
- **Cloudflare Workers** handle the one job RLS can't. RLS can gate *who*
  writes to a bucket, but it can't inspect a file's size, name or type.
  `/api/upload-url` checks all three plus the caller's role, then issues a
  short-lived signed upload URL using the `service_role` key — which never
  reaches the browser. It also picks the storage path, always namespaced under
  the uploader's user id, so a client can't write outside its own folder.

Uploads are the only server-side hop. Reads, writes and downloads stay
client-side and RLS-protected, so the app degrades gracefully if Functions are
unavailable.

### Layout

```
public/              Static site — what Pages serves
  *.html             One file per screen
  styles.css         Design system
  js/                One ES module per page, plus shared common.js
  _headers           CSP + security headers, cache policy
  _routes.json       Only /api/* invokes a Worker

functions/api/
  config.js          GET  — Supabase URL + anon key from env
  upload-url.js      POST — brokers signed uploads

schema.sql           Tables, RLS policies, storage buckets
wrangler.toml        Pages project config
```

### Data model

```
profiles     (id → auth.users, full_name, email, role, created_at)
materials    (id, title, subject, description, content,
              file_path, file_name, file_size,
              created_by → profiles, created_by_name, created_at)
assignments  (id, title, subject, description, due_date, total_marks,
              created_by → profiles, created_by_name, created_at)
submissions  (id, assignment_id → assignments, assignment_title,
              student_id → profiles, student_name, content,
              file_path, file_name, file_size, submitted_at,
              unique(assignment_id, student_id))
```

`role` on the profile row is what every RLS policy reads.

---

## Admin tasks

Run these in the Supabase **SQL Editor**.

**Promote someone to lecturer** (e.g. they picked the wrong role at signup):

```sql
update public.profiles set role = 'lecturer'
where email = 'them@example.com';
```

**List everyone and their role:**

```sql
select full_name, email, role, created_at
from public.profiles order by created_at desc;
```

**See who hasn't submitted an assignment yet:**

```sql
select p.full_name, p.email
from public.profiles p
where p.role = 'student'
  and p.id not in (
    select student_id from public.submissions
    where assignment_id = 'PASTE_ASSIGNMENT_ID'
  );
```

**Let a student re-submit** (delete their submission so they can try again):

```sql
delete from public.submissions
where assignment_id = 'PASTE_ASSIGNMENT_ID'
  and student_id = (select id from public.profiles where email = 'them@example.com');
```

**Remove a material or assignment:**

```sql
delete from public.materials where id = 'PASTE_ID';
-- deleting an assignment also deletes its submissions (cascade)
delete from public.assignments where id = 'PASTE_ID';
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Signing in bounces straight back to the login page | No profile row — the signup trigger didn't run | Re-run [`schema.sql`](schema.sql); it recreates the trigger |
| *"Please confirm your email address first"* | Email confirmation is on | Click the link in the inbox, or turn confirmation off (Step 1.3) |
| *"File storage isn't set up yet"* | Buckets missing | Re-run [`schema.sql`](schema.sql) |
| *"Server is missing: SUPABASE_..."* | Env vars not set on Pages | Add all three (Step 2.1), then redeploy |
| *"Network problem — check your connection and Supabase URL"* | Wrong project URL, or `/api/config` unreachable | Verify `SUPABASE_URL`; check the Functions log in the Pages dashboard |
| *"That file is too large"* / *".exe files aren't allowed"* | Worker rejected it | Expected — see the limits in the [teaching guide](#publishing-a-material) |
| *"You've already submitted this one"* | One submission per assignment | Delete the old row (see [Admin tasks](#admin-tasks)) |
| *"You don't have permission to do that"* | Role doesn't match the action | Check the role in `profiles`; promote if needed |
| Everything works locally but not deployed | Env vars missing on Pages, or set only on Production while you're on a Preview URL | Add them to both environments |
| Blank page, console shows a CSP error | You added a script or API on a new domain | Add that origin to the CSP in `public/_headers` |

**Where to look:** browser console first (the app surfaces plain-English
errors), then Cloudflare **Workers & Pages → your project → Functions** logs
for anything `/api/*`, then Supabase **Logs**.

---

## Limits & roadmap

Known gaps, roughly in the order they'd be worth closing:

- **No grading.** Lecturers read submissions but can't score them or leave
  feedback. Add a `grade` and `feedback` column on `submissions` plus a
  lecturer-only update policy.
- **Everyone sees everything.** There are no course enrolments, so all
  materials and assignments are visible to every signed-in user. Add a
  `course_id` and a membership table, then scope the RLS policies to it.
- **No editing or deleting** from the UI, for anything. The policies allow
  owners to update and delete; only the buttons are missing.
- **One submission per assignment**, with no re-submit or draft.
- **No notifications** — no email, no reminders, no nudges for missing work.
- **Role is fixed at signup** and only changeable via SQL.
