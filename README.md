# opencode-research-papers

[![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue.svg)](https://opencode.ai/docs/plugins/)
[![npm version](https://img.shields.io/npm/v/opencode-research-papers.svg)](https://www.npmjs.com/package/opencode-research-papers)
[![CI](https://github.com/saim-x/opencode-research-papers/actions/workflows/ci.yml/badge.svg)](https://github.com/saim-x/opencode-research-papers/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

![screenshot](./src/screenshots/screenshot.jpg)

An [opencode](https://opencode.ai) plugin that adds a `research_papers` tool. This is an AI-facing tool, not a slash command — ask the AI to search for papers and it will call the tool for you.

Install. Restart. Ask for papers. It works.

## Features

- No API keys required. Uses arXiv for fresh preprints and OpenAlex for broader scholarly metadata, citation counts, and open-access links.
- Smart `auto` source routing — arXiv for `latest`, OpenAlex for `top_cited` and `trending`, both merged when available.
- Markdown output with title, authors, date, PDF link, abstract, and citation count where available.
- Filter by recency (`latest`, `trending`) or citation impact (`top_cited`).
- Narrow results to the past week, month, or year.
- `strict` mode applies anchor + concept-group filtering to reduce loosely matched results.
- Source-level fallback: if one source fails or is rate-limited, the other handles the request transparently.
- arXiv requests are spaced 3 seconds apart per arXiv's public API terms.

## Installation

Add this to your `opencode.json`:

```json
{
  "plugin": [
    "opencode-research-papers"
  ]
}
```

Restart opencode. The tool registers automatically.

### OpenCode v2

This plugin supports both plugin APIs from one package. On OpenCode v2 it
exports a `Plugin.define` entrypoint (id `opencode-research-papers`) and
registers the same `research_papers` tool through the v2 tool transform API
(JSON Schema input, structured content output); configure it under the
`plugins` key:

```json
{
  "plugins": [
    "opencode-research-papers"
  ]
}
```

On OpenCode 1.x it keeps the legacy function entrypoint under the `plugin`
key. The combined entrypoint shape requires OpenCode 1.18.29 or newer for
1.x hosts — older 1.x releases should stay on plugin version 1.4.8.

### Updating

OpenCode caches plugin packages and does not auto-update on restart. After updating to a new version, clear the cache before restarting:

**Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\packages\opencode-research-papers@latest"
```

**macOS / Linux:**
```bash
rm -rf ~/.cache/opencode/packages/opencode-research-papers@latest
```

Then restart opencode.

## Usage

This is an AI tool — you do not invoke it with a slash command. Ask naturally:

> "Find the latest papers on Image Segmentation"

> "Show me trending Scene Text Recognition papers"

> "Get top-cited Retinal Vessel Segmentation papers"

> "Find 20 latest papers on Generative Adversarial Networks from the last month"

## Configuration

Pass options as a tuple:

```json
["opencode-research-papers", {
  "defaultMaxResults": 15,
  "defaultSource": "auto"
}]
```

| Option | Default | Description |
|--------|---------|-------------|
| `defaultMaxResults` | `10` | How many results to return (1–50) |
| `defaultSource` | `"auto"` | Source routing: `auto`, `arxiv`, or `openalex` |

### Source routing

The `auto` default selects the primary source per filter:

| Filter | Primary | Fallback |
|--------|---------|----------|
| `latest` | arXiv | OpenAlex |
| `top_cited` | OpenAlex | arXiv |
| `trending` | OpenAlex | arXiv |

Override with `source: "arxiv"` or `source: "openalex"` to use a single source.

## Data Sources

### arXiv

Provides fresh preprints across AI, CS, math, and physics. Delivers direct PDF links and clean metadata. No signup required. Requests are rate-limited to one per 3 seconds per arXiv's public API terms.

### OpenAlex

Broader scholarly search with citation counts, DOI metadata, and open-access links. Works without an API key at 10 requests per second.

## Error Handling

If one source is down or rate-limited, the plugin returns the other source's results with the specific error noted. If both fail, you receive a consolidated error message. The tool does not crash.

## License

MIT

## Roadmap

Potential future additions:

- **GitHub paper-list repos** — Search curated repository lists (e.g. `scene-text-detection-recognition-papers`) alongside paper results.
- **Better deduplication** — Title normalization is a rough heuristic; smarter deduplication could avoid showing the same paper twice.
- **Synonym expansion** — Expand common terms in strict mode (e.g. GAN → cGAN, WGAN, StyleGAN) to improve recall.
- **Semantic strict mode** — Use embeddings or cross-encoder reranking instead of keyword matching for relevance filtering.
- **Citation counts for arXiv papers** — Cross-reference arXiv results with OpenAlex to retrieve citation data.