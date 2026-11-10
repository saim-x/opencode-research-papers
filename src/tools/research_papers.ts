import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import type { PaperResult, PluginOptions, ResearchPapersInput } from "../types.js";
import { searchArxiv } from "../sources/arxiv.js";
import { searchOpenAlex } from "../sources/openalex.js";
import { formatResults } from "../formatters/markdown.js";

export const RESEARCH_PAPERS_DESCRIPTION =
  "Search for latest, trending, or top-cited research papers on a topic from arXiv and OpenAlex. Returns a formatted list with titles, authors, dates, PDF links, and citation counts. For best recall, expand acronyms and abbreviations in the user's request into the full technical terms used in paper titles and abstracts (e.g., 'MTP in LLMs' should be passed as 'Multi-Token Prediction in Large Language Models').";

let lastArxivRequest = 0;
const ARXIV_COOLDOWN_MS = 3100;

async function throttledSearchArxiv(
  query: string,
  maxResults: number,
  sortBy: "submittedDate" | "lastUpdatedDate"
): Promise<PaperResult[]> {
  const elapsed = Date.now() - lastArxivRequest;
  if (elapsed < ARXIV_COOLDOWN_MS) {
    await new Promise((r) => setTimeout(r, ARXIV_COOLDOWN_MS - elapsed));
  }
  lastArxivRequest = Date.now();
  return searchArxiv(query, maxResults, sortBy);
}

export function createResearchPapersTool(options: PluginOptions = {}): ToolDefinition {
  return tool({
    description: RESEARCH_PAPERS_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("The research field or topic using full technical terms. Expand acronyms and abbreviations (e.g., 'Multi-Token Prediction in Large Language Models' instead of 'MTP in LLMs')."),
      source: tool.schema.enum(["arxiv", "openalex", "semantic_scholar", "auto"]).default(options.defaultSource ?? "auto").describe("Which source(s) to query. 'semantic_scholar' is a deprecated alias for 'openalex'."),
      filter: tool.schema.enum(["latest", "trending", "top_cited"]).default("latest").describe("Sorting/filtering strategy"),
      max_results: tool.schema.number().min(1).max(50).default(options.defaultMaxResults ?? 10).describe("Maximum number of papers to return"),
      date_range: tool.schema.enum(["week", "month", "year", "all"]).optional().describe("Restrict results to a time window"),
      strict: tool.schema.boolean().default(false).describe("When true, applies anchor + concept-group filtering to reduce loosely matched results."),
    },
    execute: async (args, _context) => runResearchPapers(args, options),
  });
}

// Shared execution core for the V1 tool and the V2 tool definition. Defaults
// are normalized here so both entrypoints behave identically whether or not
// the host applies schema defaults.
export async function runResearchPapers(
  args: ResearchPapersInput,
  options: PluginOptions = {}
): Promise<string> {
  const maxResults = args.max_results ?? options.defaultMaxResults ?? 10;
  const source = args.source ?? options.defaultSource ?? "auto";
  const filter = args.filter ?? "latest";
  const strict = args.strict ?? false;
  const dateRange = args.date_range ?? "all";
  const fetchMultiplier = dateRange !== "all" ? 3 : 1;
  const normalizedSource = normalizeSource(source);
  const routing = resolveRouting(normalizedSource, filter);

  let arxivResults: PaperResult[] = [];
  let oaResults: PaperResult[] = [];
  let arxivError: string | null = null;
  let oaError: string | null = null;

  if (routing.useArxiv && routing.useOpenAlex) {
    // Fetch both sources in parallel
    const [arxivResult, oaResult] = await Promise.allSettled([
      (async () => {
        const sortBy = filter === "latest" ? "submittedDate" : "lastUpdatedDate";
        return throttledSearchArxiv(args.query, maxResults * fetchMultiplier, sortBy);
      })(),
      (async () => {
        const oaSort = filter === "top_cited" || filter === "trending"
          ? "top_cited"
          : "latest";
        const oaYear = dateRange === "year" ? yearParam() : undefined;
        return searchOpenAlex(args.query, maxResults, oaSort, oaYear);
      })(),
    ]);

    if (arxivResult.status === "fulfilled") {
      arxivResults = arxivResult.value;
    } else {
      arxivError = arxivResult.reason instanceof Error ? arxivResult.reason.message : String(arxivResult.reason);
    }

    if (oaResult.status === "fulfilled") {
      oaResults = oaResult.value;
    } else {
      oaError = oaResult.reason instanceof Error ? oaResult.reason.message : String(oaResult.reason);
    }
  } else if (routing.useArxiv) {
    try {
      const sortBy = filter === "latest" ? "submittedDate" : "lastUpdatedDate";
      arxivResults = await throttledSearchArxiv(args.query, maxResults * fetchMultiplier, sortBy);
    } catch (err) {
      arxivError = err instanceof Error ? err.message : String(err);
    }
  } else if (routing.useOpenAlex) {
    try {
      const oaSort = filter === "top_cited" || filter === "trending"
        ? "top_cited"
        : "latest";
      const oaYear = dateRange === "year" ? yearParam() : undefined;
      oaResults = await searchOpenAlex(args.query, maxResults, oaSort, oaYear);
    } catch (err) {
      oaError = err instanceof Error ? err.message : String(err);
    }
  }

  if (dateRange !== "all") {
    arxivResults = filterByDateRange(arxivResults, dateRange);
    oaResults = filterByDateRange(oaResults, dateRange);
  }

  annotateMatches(arxivResults, args.query);
  annotateMatches(oaResults, args.query);

  if (strict) {
    arxivResults = strictFilter(arxivResults, args.query);
    oaResults = strictFilter(oaResults, args.query);
  }

  const merged = mergeAndDeduplicate(arxivResults, oaResults, routing);
  const limited = merged.slice(0, maxResults);

  const sourcesUsed = describeSources(arxivResults, oaResults, routing, arxivError, oaError);
  let output = formatResults(args.query, filter, limited, dateRange, sourcesUsed);

  const warnings = buildWarnings(arxivError, oaError, routing, limited.length, normalizedSource, source);
  if (warnings) {
    output += warnings;
  }

  return output;
}

type Routing = { useArxiv: boolean; useOpenAlex: boolean; arxivFirst: boolean };

function normalizeSource(source: string): string {
  if (source === "semantic_scholar") return "openalex";
  return source;
}

function resolveRouting(source: string, filter: string): Routing {
  if (source === "arxiv") return { useArxiv: true, useOpenAlex: false, arxivFirst: true };
  if (source === "openalex") return { useArxiv: false, useOpenAlex: true, arxivFirst: false };

  // auto
  const citeFilter = filter === "top_cited" || filter === "trending";
  return {
    useArxiv: true,
    useOpenAlex: true,
    arxivFirst: !citeFilter,
  };
}

function buildWarnings(
  arxivError: string | null,
  oaError: string | null,
  routing: Routing,
  resultCount: number,
  normalizedSource: string,
  originalSource: string,
): string {
  const parts: string[] = [];

  if (originalSource === "semantic_scholar") {
    parts.push(`\n\n_ℹ️ 'semantic_scholar' is deprecated — using OpenAlex instead._`);
  }

  if (arxivError && oaError && routing.useArxiv && routing.useOpenAlex) {
    parts.push(`\n\n_⚠️ Both sources failed._`);
    parts.push(`\n- arXiv: ${arxivError}`);
    parts.push(`\n- OpenAlex: ${oaError}`);
    if (resultCount === 0) {
      parts.push(`\n\n_Try a different query or wait before retrying._`);
    }
  } else {
    if (arxivError && routing.useArxiv) {
      parts.push(`\n\n_⚠️ arXiv unavailable (${arxivError}).`);
      if (routing.useOpenAlex) parts.push(" Showing OpenAlex results only._");
      else parts.push("_");
    }
    if (oaError && routing.useOpenAlex) {
      parts.push(`\n\n_⚠️ OpenAlex unavailable (${oaError}).`);
      if (routing.useArxiv) parts.push(" Showing arXiv results only._");
      else parts.push("_");
    }
  }

  return parts.join("");
}

export function mergeAndDeduplicate(
  arxiv: PaperResult[],
  oa: PaperResult[],
  routing: Routing,
): PaperResult[] {
  const seen = new Set<string>();
  const merged: PaperResult[] = [];

  const addUnique = (papers: PaperResult[]) => {
    for (const paper of papers) {
      const key = normalizeTitle(paper.title);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(paper);
      }
    }
  };

  if (routing.arxivFirst) {
    addUnique(arxiv);
    addUnique(oa);
  } else {
    addUnique(oa);
    addUnique(arxiv);
  }

  return merged;
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function describeSources(
  arxivResults: PaperResult[],
  oaResults: PaperResult[],
  routing: Routing,
  arxivError: string | null,
  oaError: string | null,
): string | undefined {
  const arxivOk = routing.useArxiv && !arxivError && arxivResults.length > 0;
  const oaOk = routing.useOpenAlex && !oaError && oaResults.length > 0;

  if (arxivOk && oaOk) return "arXiv + OpenAlex";
  if (arxivOk) return "arXiv";
  if (oaOk) return "OpenAlex";
  return undefined;
}

function filterByDateRange(papers: PaperResult[], dateRange: string): PaperResult[] {
  if (!dateRange || dateRange === "all") return papers;

  const cutoff = new Date();

  switch (dateRange) {
    case "week":
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case "month":
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case "year":
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    default:
      return papers;
  }

  return papers.filter((paper) => {
    const pub = paper.published;
    if (pub === "Unknown") return true;

    if (pub.length === 4) {
      return parseInt(pub) >= cutoff.getFullYear();
    }

    try {
      return new Date(pub) >= cutoff;
    } catch {
      return true;
    }
  });
}

function annotateMatches(papers: PaperResult[], query: string): void {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

  for (const paper of papers) {
    const ti = paper.title.toLowerCase();
    const ab = (paper.abstract || "").toLowerCase();
    const fields: string[] = [];
    const matchedTerms: string[] = [];

    for (const term of terms) {
      if (ti.includes(term)) { fields.push("title"); matchedTerms.push(term); }
      else if (ab.includes(term)) { fields.push("abstract"); matchedTerms.push(term); }
    }

    const uniqueFields = [...new Set(fields)];
    const uniqueTerms = [...new Set(matchedTerms)];
    if (uniqueFields.length > 0) {
      paper.matchedIn = uniqueFields.join(", ") + " (" + uniqueTerms.join(", ") + ")";
    }
  }
}

function strictFilter(papers: PaperResult[], query: string): PaperResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return papers;

  const anchorSynonyms: Record<string, string[]> = {
    retinal: ["retinal", "fundus", "retina", "ophthalmic", "eye"],
    brain: ["brain", "cerebral", "neural", "neuro"],
    medical: ["medical", "clinical", "healthcare"],
    graph: ["graph", "gnn", "graph neural"],
    remote: ["remote", "satellite", "aerial", "sensing"],
    scene: ["scene", "scene text", "text detection"],
  };

  const anchorGroup = anchorSynonyms[terms[0]] ?? [terms[0]];
  const minTotal = Math.max(1, Math.ceil(terms.length * 0.66));

  return papers.filter((paper) => {
    const ti = paper.title.toLowerCase();
    const ab = (paper.abstract || "").toLowerCase();

    let anchorMatched = false;
    let totalMatched = 0;

    for (const term of terms) {
      if (ti.includes(term) || ab.includes(term)) {
        totalMatched++;
        if (anchorGroup.includes(term)) anchorMatched = true;
      }
    }

    if (terms.length >= 3) {
      return anchorMatched && totalMatched >= minTotal;
    }

    return totalMatched >= minTotal;
  });
}

function yearParam(): string {
  const y = new Date().getFullYear();
  return `${y - 1}-${y}`;
}
