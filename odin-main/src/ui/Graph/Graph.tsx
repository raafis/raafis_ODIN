import React, { useEffect, useRef, useState } from "react";
import cytoscape, { EdgeSingular, NodeSingular } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
cytoscape.use(coseBilkent);
import { GraphContainer, GraphStyle } from "./Graph.styles";
import { Node, Edge } from "../../shared/types/graphTypes";
import { LAYOUT_OPTIONS } from "../../shared/constants";
import { useApp } from "../hooks/useApp";

interface GraphProps {
	data: {
		nodes: Node[];
		edges: Edge[];
	};
	nodeClickCallback?: (node: NodeSingular) => void;
	edgeClickCallback?: (edge: EdgeSingular) => void;
	onBackgroundClick?: () => void;
	onActiveNodeIdChange?: (id: string | undefined) => void;
	activeNodeId?: string;
	cachedNodeIds?: Set<string>;
	loadingNodeId?: string;
	chatHighlightedNodeIds?: Set<string>;
	visible: boolean;
	disabled: boolean;
	filePath: string;
}

const Graph: React.FC<GraphProps> = ({
	data,
	nodeClickCallback,
	edgeClickCallback,
	onBackgroundClick,
	onActiveNodeIdChange,
	activeNodeId,
	cachedNodeIds,
	loadingNodeId,
	chatHighlightedNodeIds,
	visible,
	disabled,
	filePath,
}) => {
	const [selected, setSelected] = useState<string | undefined>(undefined);
	const activeNodeIdRef = useRef<string | undefined>(undefined);
	const cyRef = useRef<cytoscape.Core | null>(null);
	const positionCacheRef = useRef<Map<string, Record<string, { x: number; y: number }>>>(new Map());
	const filePathRef = useRef<string>(filePath);
	const cacheKeyRef = useRef<string>("");
	const edgeClickCallbackRef = useRef(edgeClickCallback);
	const onBackgroundClickRef = useRef(onBackgroundClick);
	const onActiveNodeIdChangeRef = useRef(onActiveNodeIdChange);
	const app = useApp();

	useEffect(() => { filePathRef.current = filePath; }, [filePath]);
	useEffect(() => { edgeClickCallbackRef.current = edgeClickCallback; });
	useEffect(() => { onBackgroundClickRef.current = onBackgroundClick; });
	useEffect(() => { onActiveNodeIdChangeRef.current = onActiveNodeIdChange; });
	useEffect(() => { activeNodeIdRef.current = activeNodeId; }, [activeNodeId]);

	app?.workspace.onLayoutReady(() => {
		app.workspace.on("resize", () => {
			if (cyRef.current) {
				cyRef.current.fit(undefined, 30);
			}
		});
	});

	const registerNodeClickHandler = () => {
		const handleNodeClick = (event: cytoscape.EventObject) => {
			if (event.target.data().priority === 1) {
				let path = event.target.data().path.split(/(\\|\/)/g).pop();
				setSelected(path);
				app?.workspace.openLinkText("", path);
			}
			onActiveNodeIdChangeRef.current?.(event.target.id());
		};
		cyRef.current?.on("click", "node", handleNodeClick);
	};

	const registerHoverHandler = () => {
		cyRef.current?.on("mouseover", "node", (event) => {
			const c1 = cyRef.current?.container(); if (c1) c1.style.cursor = "pointer";
			const node = event.target;
			node.addClass("hovered");
			node.outgoers("edge").addClass("hovered");
			node.incomers("edge").addClass("hovered-incoming");
			node.outgoers("node").addClass("hover-neighbor-outgoing");
			node.incomers("node").addClass("hover-neighbor-incoming");
			const currentActiveId = activeNodeIdRef.current;
			let excluded = node.union(node.connectedEdges()).union(node.outgoers("node")).union(node.incomers("node"));
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length) {
					excluded = excluded.union(activeNode).union(activeNode.connectedEdges()).union(activeNode.outgoers("node")).union(activeNode.incomers("node"));
				}
			}
			cyRef.current?.elements().not(excluded).addClass("dimmed");
		});
		cyRef.current?.on("mouseout", "node", (event) => {
			const c2 = cyRef.current?.container(); if (c2) c2.style.cursor = "";
			const node = event.target;
			node.removeClass("hovered");
			node.outgoers("edge").removeClass("hovered");
			node.incomers("edge").removeClass("hovered-incoming");
			node.outgoers("node").removeClass("hover-neighbor-outgoing");
			node.incomers("node").removeClass("hover-neighbor-incoming");
			cyRef.current?.elements().removeClass("dimmed");
			const currentActiveId = activeNodeIdRef.current;
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length) {
					cyRef.current?.elements()
						.not(activeNode)
						.not(activeNode.connectedEdges())
						.not(activeNode.outgoers("node"))
						.not(activeNode.incomers("node"))
						.addClass("dimmed");
				}
			}
		});
		cyRef.current?.on("mouseover", "edge", (event) => {
			const c1 = cyRef.current?.container(); if (c1) c1.style.cursor = "pointer";
			event.target.addClass("hovered");
		});
		cyRef.current?.on("mouseout", "edge", (event) => {
			const c2 = cyRef.current?.container(); if (c2) c2.style.cursor = "";
			event.target.removeClass("hovered");
		});
	};

	const registerClickHandler = () => {
		const handleClick = (event: cytoscape.EventObject) => {
			if (event.target === cyRef.current) {
				cyRef.current?.edges().deselect();
				onActiveNodeIdChangeRef.current?.(undefined);
				onBackgroundClickRef.current?.();
				cyRef.current
					?.nodes()
					.filter((node) => node.data().priority === 1)
					.unselectify();
			} else {
				cyRef.current
					?.nodes()
					.filter((node) => node.data().priority === 1)
					.selectify();
			}
		};
		cyRef.current?.on("click", handleClick);
	};

	useEffect(() => {
		const handleNodeClick = (event: cytoscape.EventObject) => {
			if (!disabled && nodeClickCallback) {
				nodeClickCallback(event.target);
			}
		};
		cyRef.current?.on("click", "node", handleNodeClick);
		return () => {
			cyRef.current?.off("click", "node", handleNodeClick);
		};
	}, [nodeClickCallback]);

	useEffect(() => {
		console.log("render");
		cyRef.current = cytoscape({
			container: document.getElementById("cy"),
			elements: { nodes: [], edges: [] },
			style: GraphStyle,
			layout: LAYOUT_OPTIONS,
			minZoom: 0.3,
			maxZoom: 2,
		});

		registerNodeClickHandler();
		registerClickHandler();
		registerHoverHandler();

		cyRef.current?.on("click", "edge", (event: cytoscape.EventObject) => {
			console.log("[ODIN] edge clicked in Graph, target:", event.target.id(), "callback:", !!edgeClickCallbackRef.current);
			edgeClickCallbackRef.current?.(event.target);
		});

		cyRef.current?.on("dragfree", "node", () => {
			const positions: Record<string, { x: number; y: number }> = {};
			cyRef.current?.nodes().forEach(node => { positions[node.id()] = node.position(); });
			positionCacheRef.current.set(cacheKeyRef.current, positions);
			const fp = filePathRef.current;
			if (fp) {
				localStorage.setItem(`odin_graph_positions_${fp}`, JSON.stringify(positions));
			}
		});

		return () => {
			console.log("destroy");
			cyRef.current?.destroy();
		};
	}, []);

	useEffect(() => {
		const refreshGraph = () => {
			if (cyRef.current) {
				const cacheKey = data.nodes.map(n => n.data.id).sort().join(",");
				cacheKeyRef.current = cacheKey;
				let cached = positionCacheRef.current.get(cacheKey);

				if (!cached && filePath) {
					const stored = localStorage.getItem(`odin_graph_positions_${filePath}`);
					if (stored) {
						try {
							const parsed: Record<string, { x: number; y: number }> = JSON.parse(stored);
							const currentIds = new Set(data.nodes.map(n => n.data.id));
							const overlap = Object.keys(parsed).filter(id => currentIds.has(id)).length;
							if (currentIds.size > 0 && overlap / currentIds.size >= 0.5) {
								cached = parsed;
								positionCacheRef.current.set(cacheKey, cached);
							}
						} catch { /* ignore corrupt data */ }
					}
				}

				cyRef.current.elements().remove();
				cyRef.current.add([...data.nodes, ...data.edges]);
				cyRef.current.edges().forEach(edge => {
					if (edge.target().data('isChatNode')) edge.addClass('chat-node-edge');
				});

				const hasAllPositions = !!cached && data.nodes.every(
					n => !!(cached as Record<string, {x:number;y:number}>)[n.data.id]
				);
				if (hasAllPositions) {
					cyRef.current.layout({ name: "preset", positions: cached!, fit: true, padding: 30 }).run();
				} else {
					cyRef.current.layout(LAYOUT_OPTIONS).run();
					if (data.nodes.length > 0) {
						const positions: Record<string, { x: number; y: number }> = {};
						cyRef.current.nodes().forEach(node => { positions[node.id()] = node.position(); });
						positionCacheRef.current.set(cacheKey, positions);
						if (filePath) {
							localStorage.setItem(`odin_graph_positions_${filePath}`, JSON.stringify(positions));
						}
					}
				}
			}
			cyRef.current?.resize();
		};

		refreshGraph();
	}, [data]);

	useEffect(() => {
		if (cyRef.current && data.nodes) {
			cyRef.current.batch(() => {
				cyRef.current?.nodes().forEach((node) => {
					const nodeData = node.data();
					if (nodeData.priority !== 1) node.unselectify();
					if (nodeData.selected) {
						node.select();
					} else {
						node.deselect();
					}
				});
			});
		}
	}, [data, selected]);

	useEffect(() => {
		if (cyRef.current) {
			cyRef.current.batch(() => {
				cyRef.current?.nodes().forEach(node => {
					if (cachedNodeIds?.has(node.id())) {
						node.addClass("has-summary");
					} else {
						node.removeClass("has-summary");
					}
				});
			});
		}
	}, [cachedNodeIds, data]);

	useEffect(() => {
		if (!cyRef.current) return;
		cyRef.current.nodes().removeClass("loading-background");
		if (loadingNodeId) {
			const node = cyRef.current.$id(loadingNodeId);
			if (node.length) node.addClass("loading-background");
		}
	}, [loadingNodeId, data]);

	useEffect(() => {
		if (!cyRef.current) return;
		cyRef.current.nodes().removeClass("chat-highlighted");
		cyRef.current.edges().removeClass("chat-highlighted chat-front");
		chatHighlightedNodeIds?.forEach(id => {
			const node = cyRef.current?.$id(id);
			if (node?.length) node.addClass("chat-highlighted");
		});
		cyRef.current.edges().forEach(edge => {
			if (
				chatHighlightedNodeIds?.has(edge.source().id()) &&
				chatHighlightedNodeIds?.has(edge.target().id())
			) {
				edge.addClass("chat-highlighted chat-front");
			}
		});
	}, [chatHighlightedNodeIds, data]);

	useEffect(() => {
		if (cyRef.current) {
			cyRef.current.edges().removeClass("edge-active edge-active-incoming");
			cyRef.current.nodes().removeClass("active-neighbor-outgoing active-neighbor-incoming");
			cyRef.current.elements().removeClass("dimmed");
			if (activeNodeId) {
				cyRef.current.edges().removeClass("chat-front");
				const activeNode = cyRef.current.$id(activeNodeId);
				if (activeNode.length) {
					activeNodeIdRef.current = activeNodeId;
					activeNode.selectify();
					activeNode.select();
					activeNode.outgoers("edge").addClass("edge-active");
					activeNode.incomers("edge").addClass("edge-active-incoming");
					activeNode.outgoers("node").addClass("active-neighbor-outgoing");
					activeNode.incomers("node").addClass("active-neighbor-incoming");
					cyRef.current.elements()
						.not(activeNode)
						.not(activeNode.connectedEdges())
						.not(activeNode.outgoers("node"))
						.not(activeNode.incomers("node"))
						.addClass("dimmed");
				}
			} else {
				activeNodeIdRef.current = undefined;
				cyRef.current.nodes().deselect();
			}
		}
	}, [activeNodeId, data]);

	return <GraphContainer id="cy" $visible={visible} />;
};

export default Graph;
