# Deploying a Static Site

This guide covers deploying a static site (HTML/CSS/JS) to `*.freecode.camp`.

## Prerequisites

- Node 20+
- R2 credentials from the platform team

## 1. Project Setup

Your project needs two things:

**A `platform.yaml` at the root:**

```yaml
name: my-site.freecode.camp
stack: static
domain:
  production: my-site.freecode.camp
  preview: preview.my-site.freecode.camp
```

`name` must match the production domain exactly.

**A build step that outputs to `dist/`:**

Any build tool works (Vite, Next export, Hugo, plain HTML). The CLI uploads everything in `dist/`.

## 2. Credentials

Get an R2 API token from the platform team. Create `.env`:

```sh
export S3_ACCESS_KEY_ID=<your-key>
export S3_SECRET_ACCESS_KEY=<your-secret>
export S3_ENDPOINT=<your-endpoint>
```

Add `.env` to `.gitignore`. Load credentials before running CLI commands:

```sh
source .env
```

## 3. Build

```sh
npm run build
```

## 4. Deploy

```sh
universe static deploy
```

This uploads `dist/` to storage and sets the preview alias. The deploy ID is printed on success.

If you're not in a git repo or have no commits yet, use `--force`:

```sh
universe static deploy --force
```

## 5. Go Live

```sh
universe static promote
```

Promotes preview to production. Your site is live at `https://my-site.freecode.camp` within 5 minutes.

## 6. Rollback

```sh
universe static rollback --confirm
```

Reverts production to the previous deploy.

## How It Works

```
universe static deploy
  -> uploads dist/ to R2 as an immutable snapshot
  -> sets preview alias to the new snapshot

universe static promote
  -> points production alias to the current preview

Every 5 minutes, the serving infrastructure syncs from R2 and
resolves the production alias. Cloudflare CDN caches at the edge.
```

Each deploy is immutable and timestamped. Promote and rollback just change which snapshot is active. Nothing is overwritten or deleted.

## FAQ

**How long until my site is live after promote?**
Up to 5 minutes. The sync runs on a 5-minute cycle.

**Can I deploy without git?**
Yes, use `--force`. The deploy ID won't include a git hash.

**Can I use a custom domain instead of \*.freecode.camp?**
Not yet. Custom domains require DNS setup by the platform team.

**What file types are supported?**
Anything. HTML, CSS, JS, images, fonts, PDFs. Content-Type headers are set automatically.

**Where do I get R2 credentials?**
Ask the platform team. One token per person, scoped to the static bucket.
