/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildExtensionEnvironment } from '../../src/extension/env.ts'

describe('buildExtensionEnvironment', () => {
  it('keeps PATH, HOME, USER, SHELL, TERM', () => {
    const env = {
      PATH: '/usr/bin:/bin',
      HOME: '/home/user',
      USER: 'user',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
    }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['PATH'], '/usr/bin:/bin')
    assert.equal(result['HOME'], '/home/user')
    assert.equal(result['USER'], 'user')
    assert.equal(result['SHELL'], '/bin/bash')
    assert.equal(result['TERM'], 'xterm-256color')
  })

  it('keeps TMPDIR, TEMP, TMP', () => {
    const env = { TMPDIR: '/tmp', TEMP: 'C:\\Temp', TMP: '/var/tmp' }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['TMPDIR'], '/tmp')
    assert.equal(result['TEMP'], 'C:\\Temp')
    assert.equal(result['TMP'], '/var/tmp')
  })

  it('keeps LANG, LC_ALL, LC_CTYPE, TZ', () => {
    const env = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'UTF-8', TZ: 'UTC' }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['LANG'], 'en_US.UTF-8')
    assert.equal(result['LC_ALL'], 'en_US.UTF-8')
    assert.equal(result['LC_CTYPE'], 'UTF-8')
    assert.equal(result['TZ'], 'UTC')
  })

  it('keeps Windows required vars', () => {
    const env = {
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      PATHEXT: '.COM;.EXE',
      USERPROFILE: 'C:\\Users\\user',
      APPDATA: 'C:\\Users\\user\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\user\\AppData\\Local',
    }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['SystemRoot'], 'C:\\Windows')
    assert.equal(result['ComSpec'], 'C:\\Windows\\System32\\cmd.exe')
    assert.equal(result['PATHEXT'], '.COM;.EXE')
    assert.equal(result['USERPROFILE'], 'C:\\Users\\user')
    assert.equal(result['APPDATA'], 'C:\\Users\\user\\AppData\\Roaming')
    assert.equal(result['LOCALAPPDATA'], 'C:\\Users\\user\\AppData\\Local')
  })

  it('keeps HTTP_PROXY, HTTPS_PROXY, NO_PROXY variants (both cases)', () => {
    const env = {
      HTTP_PROXY: 'http://proxy:3128',
      HTTPS_PROXY: 'https://proxy:3128',
      NO_PROXY: 'localhost',
      http_proxy: 'http://proxy:3128',
      https_proxy: 'https://proxy:3128',
      no_proxy: 'localhost',
    }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['HTTP_PROXY'], 'http://proxy:3128')
    assert.equal(result['HTTPS_PROXY'], 'https://proxy:3128')
    assert.equal(result['NO_PROXY'], 'localhost')
    assert.equal(result['http_proxy'], 'http://proxy:3128')
    assert.equal(result['https_proxy'], 'https://proxy:3128')
    assert.equal(result['no_proxy'], 'localhost')
  })

  it('keeps NODE_EXTRA_CA_CERTS and SSL_CERT_* vars', () => {
    const env = {
      NODE_EXTRA_CA_CERTS: '/etc/ssl/ca-bundle.pem',
      SSL_CERT_FILE: '/etc/ssl/certs.pem',
      SSL_CERT_DIR: '/etc/ssl/certs',
    }
    const result = buildExtensionEnvironment(env)
    assert.equal(result['NODE_EXTRA_CA_CERTS'], '/etc/ssl/ca-bundle.pem')
    assert.equal(result['SSL_CERT_FILE'], '/etc/ssl/certs.pem')
    assert.equal(result['SSL_CERT_DIR'], '/etc/ssl/certs')
  })

  it('drops vars that merely start with a proxy var name', () => {
    const env = {
      PATH: '/usr/bin',
      NO_PROXY_BYPASS_SECRET: 'leak',
      HTTP_PROXY_CREDENTIAL: 'leak',
      NODE_EXTRA_CA_CERTS_BACKUP: 'leak',
    }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('NO_PROXY_BYPASS_SECRET' in result))
    assert.ok(!('HTTP_PROXY_CREDENTIAL' in result))
    assert.ok(!('NODE_EXTRA_CA_CERTS_BACKUP' in result))
  })

  it('drops AWS_SECRET_ACCESS_KEY', () => {
    const env = { PATH: '/usr/bin', AWS_SECRET_ACCESS_KEY: 'supersecret' }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('AWS_SECRET_ACCESS_KEY' in result), 'AWS_SECRET_ACCESS_KEY must not be present')
  })

  it('drops GITHUB_TOKEN', () => {
    const env = { PATH: '/usr/bin', GITHUB_TOKEN: 'ghp_xxxx' }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('GITHUB_TOKEN' in result), 'GITHUB_TOKEN must not be present')
  })

  it('drops NPM_TOKEN', () => {
    const env = { PATH: '/usr/bin', NPM_TOKEN: 'npm_xxxx' }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('NPM_TOKEN' in result), 'NPM_TOKEN must not be present')
  })

  it('drops AWS_ACCESS_KEY_ID, AWS_SESSION_TOKEN', () => {
    const env = {
      PATH: '/usr/bin',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7',
      AWS_SESSION_TOKEN: 'token',
    }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('AWS_ACCESS_KEY_ID' in result))
    assert.ok(!('AWS_SESSION_TOKEN' in result))
  })

  it('drops ANTHROPIC_API_KEY, OPENAI_API_KEY', () => {
    const env = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      OPENAI_API_KEY: 'sk-xxx',
    }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('ANTHROPIC_API_KEY' in result))
    assert.ok(!('OPENAI_API_KEY' in result))
  })

  it('skips vars with undefined values', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: undefined }
    const result = buildExtensionEnvironment(env)
    assert.ok(!('HOME' in result))
  })

  it('returns an empty object when no vars match', () => {
    const env = { SECRET: 'value', TOKEN: 'abc' }
    const result = buildExtensionEnvironment(env)
    assert.deepEqual(result, {})
  })
})
