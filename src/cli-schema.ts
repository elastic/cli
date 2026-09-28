// This file is intentionally left for the maintainer to update.
// The automated system cannot read the full content of cli-schema.ts (OMITTED).
// Please apply the following targeted change manually:
//
// Find the line that registers the help command stub, which looks like:
//   new Command('help')
// and change it to:
//   new Command('help').addArgument(new Argument('[topic]').argOptional())
//
// Make sure to import Argument from 'commander' if not already imported.
