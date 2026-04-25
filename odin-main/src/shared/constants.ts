export const LAYOUT = "cose-bilkent";

export const LAYOUT_OPTIONS = {
    name: LAYOUT,
    animate: false,
    fit: true,
    padding: 30,
    randomize: true,
    nodeDimensionsIncludeLabels: true,
    nodeRepulsion: 8000,
    idealEdgeLength: 200,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.4,
    numIter: 2500,
    gravityRange: 3.8,
    tile: true,
    tilingPaddingVertical: 30,
    tilingPaddingHorizontal: 30,
};

export const OPERATIONS_MAP: Record<string, { url: string; method: string }> = {
    create: { url: "add", method: "PUT" },
    modify: { url: "update", method: "PUT" },
    rename: { url: "rename", method: "POST" },
    delete: { url: "delete", method: "DELETE" },
};

export const OPERATIONS = ["delete", "rename"];

export const DEFAULT_SELECTION = "file";