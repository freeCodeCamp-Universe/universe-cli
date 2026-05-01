# Static Scaffold Convention (Spike Lock)

Static scaffolds in this spike follow one explicit local-serving convention.

## Layout

- Static starter files are written under `public/`.
- Required files include:
  - `public/index.html`
  - `public/styles.css`
  - `public/main.js`

## Local server

- Static projects use `serve` as the single local webserver in this spike.
- `docker-compose.dev.yml` starts `serve` against `public/`.
- `Procfile` starts `serve` against `public/`.
