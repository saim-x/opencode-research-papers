import { describe, it, expect } from "vitest";
import plugin from "../index.js";

// Captures what setup() registers through the OpenCode v2 tool transform API.
async function registeredTools(options: Record<string, unknown> = {}): Promise<any[]> {
  const added: any[] = [];
  const editor = { add: (tool: unknown) => added.push(tool) };
  const ctx = {
    options,
    tool: { transform: async (callback: (editor: unknown) => void) => callback(editor) },
  };
  await (plugin as any).setup(ctx);
  return added;
}

describe("dual V1/V2 default export", () => {
  it("default-exports a v2 definition object with an id and setup", () => {
    expect(typeof plugin).toBe("object");
    expect(typeof (plugin as any).id).toBe("string");
    expect(((plugin as any).id as string).length).toBeGreaterThan(0);
    expect(typeof (plugin as any).setup).toBe("function");
  });

  it("keeps the v1 server() entrypoint for OpenCode 1.x hosts", () => {
    expect(typeof (plugin as any).server).toBe("function");
  });

  it("server() returns the v1 tool map without executing it", async () => {
    const result = await (plugin as any).server({}, { defaultMaxResults: 7 });
    expect(result.tool.research_papers).toBeDefined();
  });

  it("setup registers exactly one research_papers tool with JSON Schema input", async () => {
    const added = await registeredTools({ defaultMaxResults: 7, defaultSource: "openalex" });
    expect(added).toHaveLength(1);

    const tool = added[0];
    expect(tool.name).toBe("research_papers");
    expect(tool.description).toContain("arXiv");
    expect(tool.input.type).toBe("object");
    expect(tool.input.required).toEqual(["query"]);
    expect(tool.input.additionalProperties).toBe(false);
    expect(tool.input.properties.source.enum).toContain("semantic_scholar");
    expect(tool.input.properties.max_results.minimum).toBe(1);
    expect(tool.input.properties.max_results.maximum).toBe(50);
    expect(tool.input.properties.max_results.default).toBe(7);
    expect(tool.input.properties.source.default).toBe("openalex");
    expect(tool.input.properties.strict.default).toBe(false);
  });

  it("falls back to built-in defaults when no options are provided", async () => {
    const added = await registeredTools();
    expect(added[0].input.properties.max_results.default).toBe(10);
    expect(added[0].input.properties.source.default).toBe("auto");
  });
});
