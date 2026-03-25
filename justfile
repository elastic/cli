build:
  go build -o bin/elastic main.go

test:
  go test ./...

lint:
  go vet ./...

lint-fix:
  gofmt -w .
