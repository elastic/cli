/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global test setup: force the confirmation guard onto its non-TTY,
 * fail-closed path for the whole run.
 *
 * With `--test-isolation=none` every test file shares one process and
 * inherits the real terminal's stdin. A destructive command test that does
 * not override the TTY seam would otherwise reach `promptConfirm()`, open a
 * readline on the interactive stdin, and block forever waiting for `y/N`
 * (e.g. `extension remove`). Under the previous per-file process isolation
 * each child had a non-TTY stdin, so this never surfaced.
 *
 * Tests that need the interactive path still override the seam locally via
 * `_testSetIsTTY(true)` and restore to this `false` default afterwards.
 */

import { _testSetIsTTY } from '../src/factory.ts'

_testSetIsTTY(false)
