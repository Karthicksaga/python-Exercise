# Go security remediation — 23 October 2026

The supplied CI report identified 15 reachable vulnerabilities across the Go standard library, `golang.org/x/text`, `github.com/jackc/pgx/v5`, and `github.com/go-jose/go-jose/v4`.

The Docker builder already used Go 1.27.3, but `go.mod` requested 1.27.0 and the CI workflow selected its toolchain from that directive. Library versions also predated the reported fixes.

## Changes

| Component | Previous | Updated |
| --- | --- | --- |
| Minimum Go toolchain / CI selection | 1.27.0 | 1.27.3 |
| pgx/v5 | 5.8.0 | 5.9.2 |
| go-jose/v4 | 4.1.3 | 4.1.4 |
| x/text | 0.29.0 | 0.41.0 |
| x/sync (transitive requirement) | 0.17.0 | 0.22.0 |

`go.sum` was regenerated through the verified Go module downloader. CI now logs the selected Go version, uses `GOTOOLCHAIN=local` after installing the version from go.mod, produces an API binary, and scans both source and the compiled artifact. Security checks remain mandatory; no findings are suppressed.

## Verification

- `go vet ./...`: passed.
- `go test -race ./... -count=1` against real disposable PostgreSQL and Redis: passed.
- `govulncheck -show verbose ./...`: **No vulnerabilities found**, covering 13 modules and the Go 1.27.3 standard library.
- `govulncheck -mode=binary <rebuilt-api>`: **No vulnerabilities found**.
- Rebuilt artifact runtime image: passed; patched API readiness and healthcheck passed as nonroot on a read-only filesystem.

The live `vuln.go.dev` endpoint is blocked in this workspace. Both scans used the complete, unmodified OSV directory from the official [golang/vulndb repository](https://github.com/golang/vulndb/tree/e0bad56276e98711a598adbab976de7cd914013a), revision `e0bad56276e98711a598adbab976de7cd914013a`. Govulncheck's supported `file://` database mode builds its own index from those entries. No advisories were deleted or edited.

To reproduce against that same snapshot:

```sh
git clone https://github.com/golang/vulndb.git /tmp/go-vulndb
git -C /tmp/go-vulndb checkout e0bad56276e98711a598adbab976de7cd914013a
cd hop-platform/backend
go version
govulncheck -db file:///tmp/go-vulndb/data/osv -show verbose ./...
go build -trimpath -o /tmp/hop-api ./cmd/api
govulncheck -db file:///tmp/go-vulndb/data/osv -mode=binary /tmp/hop-api
```

Normal CI continues to use the live vulnerability feed, so later advisories can fail the build. The remote Actions result is not claimed: GitHub API access is also blocked here. These results address the reported dependency/toolchain vulnerabilities; the remaining operational release gates in ARCHITECTURE.md and DEPLOYMENT.md still apply.
