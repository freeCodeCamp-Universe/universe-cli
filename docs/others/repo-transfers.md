# Migrating a repo you already started

> **Temporary doc.** Bridges the gap while everyone moves to org-first repos. Once the personal-account experiments are drained, this page goes away. Canonical creation flow lives in [STAFF-GUIDE → Creating a repository](../STAFF-GUIDE.md#creating-a-repository).

Started an experiment on your **personal** GitHub account and now want it under `freeCodeCamp-Universe`? **Don't use GitHub's "Transfer ownership."** No more transfer-to-Mrugesh-who-transfers-to-org dance.

Instead lean on Git's distributed nature: your **local** clone is the source of truth. You only re-point the remote — nothing leaves your machine that isn't already there.

## Steps

Example: personal repo is `git@github.com:raisedadead/shiny.git`, you want it at `git@github.com:freeCodeCamp-Universe/shiny.git`.

1. **Request the org repo** — same (or similar) name, via the CLI. Wait for approval:

   ```sh
   universe repo create shiny --visibility private --yes
   universe repo status <id>          # watch pending → active
   ```

1. **Re-point `origin`** at the org repo (your local commits stay put):

   ```sh
   git remote set-url origin git@github.com:freeCodeCamp-Universe/shiny.git
   ```

1. **Push everything** — all branches and tags:

   ```sh
   git push origin --all
   git push origin --tags
   ```

1. **Verify** the org repo has every branch/tag you expect (GitHub UI or `git ls-remote origin`).

1. **Delete the personal repo** only after step 4 checks out. Settings → Danger Zone → Delete.

That's it — under two minutes. The org repo is now your `origin`.

## If you contribute via fork + PR

Direct-push staff can stop at step 5. If your workflow is fork-based (fork the org repo, open PRs against it), then after deleting the old personal repo, fork the **org** repo afresh and add it as a remote:

```sh
git remote add fork git@github.com:raisedadead/shiny.git   # your new fork
git push fork --all
```

Push feature branches to `fork`, open PRs against `origin` (the org).

## Better still: start on the org

If you're confident the experiment has legs, skip all of the above — `universe repo create` it on the org from the start.
