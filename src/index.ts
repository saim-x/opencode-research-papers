import { Plugin } from "@opencode/plugin";
import { createResearchPapersTool } from "./tools/research_papers.js";
import { RESEARCH_PAPERS_PLUGIN_ID, researchPapersToolDefinition } from "./v2_tool.js";
import type { PluginOptions } from "./types.js";

// V1 entrypoint for OpenCode 1.x hosts (object entrypoints are supported
// since OpenCode 1.18.29; older V1 releases need a function default export).
// The return type is annotated with a portable shape: the inferred type would
// embed unnameable declaration types from @opencode-ai/plugin (TS2742).
const server = async (
  _input: unknown,
  options?: PluginOptions
): Promise<{ tool: { research_papers: unknown } }> => {
  return {
    tool: {
      research_papers: createResearchPapersTool(options),
    },
  };
};

// The dual entrypoint is annotated explicitly: its inferred type would embed
// unnameable SDK declaration types (TS2742) and break declaration emit.
interface ResearchPapersPlugin {
  id: string;
  // The setup context comes from the host runtime; typed loosely here to keep
  // the published declarations portable across @opencode/plugin releases.
  setup: (ctx: any) => unknown;
  server: typeof server;
}

// Dual V1/V2 entrypoint per the official migration guide: V2 hosts read the
// Plugin.define fields (id + setup), V1 hosts call server().
const plugin: ResearchPapersPlugin = {
  ...Plugin.define({
    id: RESEARCH_PAPERS_PLUGIN_ID,
    setup(ctx) {
      const options = (ctx.options ?? {}) as PluginOptions;
      ctx.tool.transform((editor) => {
        editor.add(researchPapersToolDefinition(options));
      });
    },
  }),
  server,
};

export default plugin;
