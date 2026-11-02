/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DynamicCompleters } from './enumerate.ts'
import { completeContextNames } from './completers/context-names.ts'

/** The completers used by the `__complete` command. */
export const defaultCompleters: DynamicCompleters = {
  flags: new Map([
    ['--use-context', completeContextNames],
  ]),
  positionals: new Map([
    ['config current-context set', completeContextNames],
    ['config context edit', completeContextNames],
    ['config context remove', completeContextNames],
  ]),
}
