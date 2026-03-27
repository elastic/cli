build:
  go build -o bin/elastic main.go

test:
  go test ./...

test-race:
  go test -race ./...

lint:
  go vet ./...

lint-fix:
  gofmt -w .
  go mod tidy
