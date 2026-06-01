# Universe CLI

A CLI for freeCodeCamp staff and operators to deploy, manage and maintain constellation apps on the freeCodeCamp Universe Platform.

## Install

### npm

```sh
# Run directly
npx @freecodecamp/universe-cli <command>

# Or install globally
npm install -g @freecodecamp/universe-cli
universe <command>
```

### Binary

<details>
  <summary>
    Download the latest binary from <a href="https://github.com/freeCodeCamp-Universe/universe-cli/releases">Releases</a>:
  </summary>

```sh
  # macOS (Apple Silicon)
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-darwin-arm64"
  chmod +x universe-darwin-arm64
  sudo mv universe-darwin-arm64 /usr/local/bin/universe

  # macOS (Intel)
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-darwin-amd64"
  chmod +x universe-darwin-amd64
  sudo mv universe-darwin-amd64 /usr/local/bin/universe

  # Linux x64
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-linux-amd64"
  chmod +x universe-linux-amd64
  sudo mv universe-linux-amd64 /usr/local/bin/universe

  # Linux ARM64
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-linux-arm64"
  chmod +x universe-linux-arm64
  sudo mv universe-linux-arm64 /usr/local/bin/universe
```

</details>

Verify:

```sh
universe --version
```

## Quickstart

```sh
universe login          # GitHub OAuth device flow
# add a platform.yaml at your repo root with: site: my-site
universe static deploy  # upload the build to a new preview deploy
universe static promote # point production at that deploy
```

## Docs

Start with the [Staff Guide](docs/STAFF-GUIDE.md). See the [command reference](docs/reference.md), the [`platform.yaml` schema](docs/platform-yaml.md), or [architecture & internals](docs/README.md).

## License

Copyright © 2014 freeCodeCamp.org

The content of this repository is bound by the following license:

- The computer software is licensed under the [BSD-3-Clause](LICENSE) license.
