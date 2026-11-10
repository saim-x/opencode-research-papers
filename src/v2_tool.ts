import { runResearchPapers, RESEARCH_PAPERS_DESCRIPTION } from "./tools/research_papers.js";
import type { PluginOptions, ResearchPapersInput } from "./types.js";

export const RESEARCH_PAPERS_PLUGIN_ID = "opencode-research-papers";

/**
 * V2 tool definition (JSON Schema input, structured content output) for the
 * OpenCode v2 plugin API. Registered through `ctx.tool.transform` in setup();
 * shares the execution core with the V1 tool.
 */
export function researchPapersToolDefinition(options: PluginOptions = {}) {
  const defaultMaxResults = options.defaultMaxResults ?? 10;
  const defaultSource = options.defaultSource ?? "auto";

  return {
    name: "research_papers",
    description: RESEARCH_PAPERS_DESCRIPTION,
    input: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "The research field or topic using full technical terms. Expand acronyms and abbreviations (e.g., 'Multi-Token Prediction in Large Language Models' instead of 'MTP in LLMs').",
        },
        source: {
          type: "string" as const,
          enum: ["arxiv", "openalex", "semantic_scholar", "auto"],
          default: defaultSource,
          description: "Which source(s) to query. 'semantic_scholar' is a deprecated alias for 'openalex'.",
        },
        filter: {
          type: "string" as const,
          enum: ["latest", "trending", "top_cited"],
          default: "latest",
          description: "Sorting/filtering strategy",
        },
        max_results: {
          type: "number" as const,
          minimum: 1,
          maximum: 50,
          default: defaultMaxResults,
          description: "Maximum number of papers to return",
        },
        date_range: {
          type: "string" as const,
          enum: ["week", "month", "year", "all"],
          description: "Restrict results to a time window",
        },
        strict: {
          type: "boolean" as const,
          default: false,
          description:
            "When true, applies anchor + concept-group filtering to reduce loosely matched results.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(input: unknown) {
      // The JSON Schema input above guarantees the ResearchPapersInput shape
      // (required "query", additionalProperties: false); the v2 SDK types the
      // schema-validated input as unknown.
      return {
        content: await runResearchPapers(input as ResearchPapersInput, {
          defaultMaxResults,
          defaultSource,
        }),
      };
    },
  };
}
