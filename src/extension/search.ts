/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery via the GitHub repository search API.
 *
 * Searches for repos tagged with the `elastic-extension` GitHub topic.
 * An optional free-text query further filters results.
 *
 * Security:
 *   - fetch() is called with redirect: 'error' to prevent credential leakage
 *     on unexpected redirects.
 *   - The query string is encoded with encodeURIComponent before interpolation.
 *   - No credentials are sent; the call uses the public GitHub API rate limit
 *     (10 requests/minute unauthenticated). Passing a GITHUB_TOKEN in the
 *     environment raises this to 30 requests/minute.
 */

const GITHUB_TOPIC = 'elastic-extension'
const GITHUB_API = 'https://api.github.com'

export interface ExtensionSearchResult {
  /** GitHub `owner/repo` slug. */
  repo: string
  /** Short human-readable description from the GitHub repo, or empty string. */
  description: string
  /** URL to the repository on GitHub. */
  url: string
  /** Ready-to-paste install command. */
  installCommand: string
}

interface GitHubRepoItem {
  full_name: string
  description: string | null
  html_url: string
}

interface GitHubSearchResponse {
  items: GitHubRepoItem[]
}

/**
 * Queries GitHub for repositories tagged with `elastic-extension`.
 * An optional `query` string is appended to narrow results (e.g. a keyword).
 *
 * @param query  Optional free-text search terms to append to the topic filter.
 * @returns      Array of matching extension metadata, sorted by GitHub stars (desc).
 */
export async function searchExtensions (query?: string): Promise<ExtensionSearchResult[]> {
  const q = query != null && query.trim().length > 0
    ? `topic:${GITHUB_TOPIC} ${query.trim()}`
    : `topic:${GITHUB_TOPIC}`

  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const resp = await fetch(url, { headers, redirect: 'error' })

  if (resp.status === 403 || resp.status === 429) {
    throw new Error(
      'GitHub API rate limit reached. Set the GITHUB_TOKEN environment variable to increase the limit.'
    )
  }
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json() as GitHubSearchResponse

  return data.items.map((item) => ({
    repo: item.full_name,
    description: item.description ?? '',
    url: item.html_url,
    installCommand: `elastic extension install github:${item.full_name}`,
  }))
}
