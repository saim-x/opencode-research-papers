export interface PaperResult {
  title: string;
  authors: string[];
  published: string;
  source: "arXiv" | "OpenAlex";
  pdfUrl?: string;
  codeUrl?: string;
  abstract?: string;
  citations?: number;
  arxivId?: string;
  matchedIn?: string;
}

export interface PluginOptions {
  defaultMaxResults?: number;
  defaultSource?: "arxiv" | "openalex" | "auto";
}

export type FilterType = "latest" | "trending" | "top_cited";
export type SourceType = "arxiv" | "openalex" | "auto";
export type DateRange = "week" | "month" | "year" | "all";

export interface ResearchPapersInput {
  query: string;
  source?: SourceType | "semantic_scholar";
  filter?: FilterType;
  max_results?: number;
  date_range?: DateRange;
  strict?: boolean;
}
