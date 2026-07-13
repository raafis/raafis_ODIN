import { GraphEdge } from "src/model/GraphEdge";
import { GraphNode } from "src/model/GraphNode";
import { Edge, Node } from "src/shared/types/graphTypes";
import { fetchData } from "src/util/fetchData";
import shortenWord from "src/util/shortenWord";

export const fetchGraphData = async (root: string, selectedFile: string, ignoreResults: boolean, suggested: number[], includeOrphans: boolean = false): Promise<{ nodes: Node[], edges: Edge[], rawNodeCount: number }> => {
    if (!selectedFile) return { nodes: [], edges: [], rawNodeCount: 0 };

    const fetchUrl = "http://localhost:8000/knowledge_base/notes/get_for_path";
    const fetchBody = { path: root + "/" + selectedFile, type: "Notes", content: "" };

    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];

    console.log("fetching");
    await fetchData(fetchUrl, fetchBody)
        .then((data) => {
            if (!ignoreResults) {
                if (data && data.length > 0) {
                    console.log("fetched data: ")
                    console.log(data);
                    data.forEach((element: GraphEdge | GraphNode) => {
                        if (element.type === "node" && "name" in element.properties) {
                            const fileName =
                                element.properties.file_path.replace(
                                    root + "/",
                                    ""
                                );
                            nodeList.push({
                                data: {
                                    id: element.id + "",
                                    label: shortenWord(element.properties.name, 20),
                                    fullLabel: element.properties.name,
                                    priority: 1,
                                    selected: suggested.contains(element.id),
                                    path: fileName,
                                },
                            });
                        } else if (element.type === "relationship" && "label" in element) {
                            edgeList.push({
                                data: {
                                    id: "e_" + element.id,
                                    label: shortenWord(element.label, 20),
                                    fullLabel: element.label,
                                    source: element.start + "",
                                    target: element.end + "",
                                },
                            });
                        }
                    });
                }
            }
        });

    const nodeIds = new Set(nodeList.map(n => n.data.id));
    const filteredEdges = edgeList.filter(e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target));
    const connectedIds = new Set([...filteredEdges.map(e => e.data.source), ...filteredEdges.map(e => e.data.target)]);
    const filteredNodes = includeOrphans ? nodeList : nodeList.filter(n => connectedIds.has(n.data.id));
    return { nodes: filteredNodes, edges: filteredEdges, rawNodeCount: nodeList.length }
}