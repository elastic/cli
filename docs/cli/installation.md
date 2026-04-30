# Installation

The `elastic` CLI is not yet available on npm. Install it by cloning the repository, building, and linking it locally.

```bash
git clone git@github.com:elastic/cli.git
cd cli
npm install
npm run build
npm link
```

Once linked, verify the installation:

```bash
elastic --help
```
