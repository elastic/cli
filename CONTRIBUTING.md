# Contributing to the Elastic CLI

Thanks for your interest in contributing! We love receiving contributions from our community. Whether you're fixing bugs, adding features, improving documentation, or sharing ideas, we'd love to have your help.

## Ways to contribute

- **Report bugs**: Open an issue describing what you found
- **Suggest features**: Tell us what you'd like to see
- **Improve docs**: Help us clarify README, examples, or error messages
- **Write code**: Submit PRs with fixes or new functionality

## Getting started

### Prerequisites

- Node.js (v22 or later)
- npm

### Setup

1. **Clone the repository**
   ```bash
   git clone git@github.com:elastic/cli.git
   cd cli
   ```

2. **Install dependencies and build**
   ```bash
   npm install
   npm run build
   ```

3. **Run tests to verify your setup**
   ```bash
   npm test
   ```

## Running tests

| Command | Purpose |
|---------|---------|
| `npm test` | Build, lint, and run unit tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:lint` | Run ESLint |
| `npm run test:lint -- --fix` | Fix linter errors automatically |

## Code standards

### Naming conventions

- **Functions/variables**: `camelCase`
- **Types/interfaces**: `PascalCase`
- **YAML config keys**: `snake_case` (e.g., `api_key`, not `apiKey`)
- **Exported utility functions**: Include complete JSDoc comments

### Dependencies

Adding new third-party dependencies is **strongly discouraged** to minimize supply-chain risk. If you need to add one, discuss it in an issue first.

## Before submitting a PR

1. **Open an issue first**: Discuss your idea before investing time
2. **Write tests**: All changes should have corresponding unit tests
3. **Test locally**: Run `npm test` and verify everything passes
4. **Check linting**: Fix any lint errors with `npm run test:lint -- --fix`
5. **Review your code**: Would you understand it in 6 months? Can it be simpler?

## Submitting a PR

1. **Fork the repository**: Create a feature branch
2. **Commit with clear messages**: Describe what and why
3. **Push and open a PR**: Link to the issue(s) your PR addresses

In your PR description:

- Explain what problem you're solving
- Describe your approach
- Note any breaking changes
- Reference related issues (e.g., "Closes #123")

4. **Sign the CLA**: [Elastic Contributor License Agreement](https://www.elastic.co/contributor-agreement/) (one-time only)

## What to expect

- We'll review your PR as soon as we can; thanks for your patience!
- We may ask questions or request changes
- Once approved, we'll merge and handle the release

## Questions?

- Check the [README](./README.md) for project overview
- See [AGENTS.md](./AGENTS.md) for architecture and tech stack details
- Open an issue if something is unclear

Thanks for making the Elastic CLI better!
