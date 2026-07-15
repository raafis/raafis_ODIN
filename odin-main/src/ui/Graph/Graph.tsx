import React, { useEffect, useRef, useState } from "react";
import cytoscape, { EdgeSingular, NodeSingular } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
cytoscape.use(coseBilkent);
import { GraphContainer, GraphOuter, GraphStyle, ClusterToggleButton, ClusterIcon, CollapseAllButton, ClusterMenuDropdown, ClusterMenuLabel, ClusterMenuRow, ClusterMenuRowLabel, ClusterMenuReClusterBtn, ClusterMenuSeparator, ClusterMenuActionBtn } from "./Graph.styles";
import { Node, Edge, ClusterClickInfo } from "../../shared/types/graphTypes";
import { LAYOUT_OPTIONS } from "../../shared/constants";
import { useApp } from "../hooks/useApp";

interface ClusterEntry {
	nodeIds: string[];
	centroid: { x: number; y: number };
	label?: string;
	hubNodeId?: string;
}

interface GraphProps {
	data: {
		nodes: Node[];
		edges: Edge[];
	};
	nodeClickCallback?: (node: NodeSingular) => void;
	edgeClickCallback?: (edge: EdgeSingular) => void;
	onBackgroundClick?: () => void;
	onActiveNodeIdChange?: (id: string | undefined) => void;
	onClusterClick?: (info: ClusterClickInfo) => void;
	onClusterCollapsed?: (communityId: string) => void;
	onClusterModeChange?: (isActive: boolean) => void;
	activeNodeId?: string;
	cachedNodeIds?: Set<string>;
	loadingNodeId?: string;
	loadingClusterHubId?: string;
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
	onClusterClick,
	onClusterCollapsed,
	onClusterModeChange,
	activeNodeId,
	cachedNodeIds,
	loadingNodeId,
	loadingClusterHubId,
	chatHighlightedNodeIds,
	visible,
	disabled,
	filePath,
}) => {
	const [selected, setSelected] = useState<string | undefined>(undefined);
	const [isClustered, setIsClustered] = useState(false);
	const [expandedCount, setExpandedCount] = useState(0);
	const [expandedClusterList, setExpandedClusterList] = useState<{ communityId: string; label: string }[]>([]);
	const [showClusterMenu, setShowClusterMenu] = useState(false);
	const clusterMenuRef = useRef<HTMLDivElement | null>(null);

	const activeNodeIdRef = useRef<string | undefined>(undefined);
	const cyRef = useRef<cytoscape.Core | null>(null);
	const positionCacheRef = useRef<Map<string, Record<string, { x: number; y: number }>>>(new Map());
	const filePathRef = useRef<string>(filePath);
	const cachedNodeIdsRef = useRef<Set<string>>(new Set());
	const loadingClusterHubIdRef = useRef<string | undefined>(undefined);
	const cacheKeyRef = useRef<string>("");
	const edgeClickCallbackRef = useRef(edgeClickCallback);
	const onBackgroundClickRef = useRef(onBackgroundClick);
	const onActiveNodeIdChangeRef = useRef(onActiveNodeIdChange);
	const app = useApp();

	// Cluster state refs (accessed inside Cytoscape event handlers)
	const clusterGroupsRef = useRef<Map<string, ClusterEntry>>(new Map());
	const crossGroupEdgesRef = useRef<Set<string>>(new Set());
	const expandedGroupsRef = useRef<Set<string>>(new Set());
	const isModeClusteredRef = useRef(false);
	const expandClusterRef = useRef<(group: string) => void>(() => {});
	const collapseClusterRef = useRef<(group: string) => void>(() => {});
	const onClusterClickRef = useRef<((info: ClusterClickInfo) => void) | undefined>(undefined);
	const onClusterCollapsedRef = useRef<((communityId: string) => void) | undefined>(undefined);
	const onClusterModeChangeRef = useRef<((isActive: boolean) => void) | undefined>(undefined);

	useEffect(() => { filePathRef.current = filePath; }, [filePath]);
	useEffect(() => { cachedNodeIdsRef.current = cachedNodeIds ?? new Set(); }, [cachedNodeIds]);
	useEffect(() => { loadingClusterHubIdRef.current = loadingClusterHubId; }, [loadingClusterHubId]);
	useEffect(() => { edgeClickCallbackRef.current = edgeClickCallback; });
	useEffect(() => { onBackgroundClickRef.current = onBackgroundClick; });
	useEffect(() => { onActiveNodeIdChangeRef.current = onActiveNodeIdChange; });
	useEffect(() => { onClusterClickRef.current = onClusterClick; });
	useEffect(() => { onClusterCollapsedRef.current = onClusterCollapsed; });
	useEffect(() => { onClusterModeChangeRef.current = onClusterModeChange; });
	useEffect(() => { activeNodeIdRef.current = activeNodeId; }, [activeNodeId]);

	app?.workspace.onLayoutReady(() => {
		app.workspace.on("resize", () => {
			if (cyRef.current) {
				cyRef.current.fit(undefined, 30);
			}
		});
	});

	// --- Clustering helpers ---

	const labelPropagation = (
		nodeIds: string[],
		edges: Array<{ source: string; target: string }>,
		maxIter = 30
	): Map<string, string> => {
		const labels = new Map<string, string>();
		nodeIds.forEach(id => labels.set(id, id));

		const adj = new Map<string, string[]>();
		nodeIds.forEach(id => adj.set(id, []));
		edges.forEach(({ source, target }) => {
			adj.get(source)?.push(target);
			adj.get(target)?.push(source);
		});

		for (let iter = 0; iter < maxIter; iter++) {
			let changed = false;
			for (const nodeId of nodeIds) {
				const neighbors = adj.get(nodeId) ?? [];
				if (neighbors.length === 0) continue;
				const freq = new Map<string, number>();
				for (const nb of neighbors) {
					const lbl = labels.get(nb)!;
					freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
				}
				let bestLabel = labels.get(nodeId)!;
				let bestFreq = 0;
				for (const [lbl, cnt] of freq) {
					if (cnt > bestFreq || (cnt === bestFreq && lbl < bestLabel)) {
						bestFreq = cnt;
						bestLabel = lbl;
					}
				}
				if (bestLabel !== labels.get(nodeId)) {
					labels.set(nodeId, bestLabel);
					changed = true;
				}
			}
			if (!changed) break;
		}
		return labels;
	};

	const computeClusterGroups = () => {
		if (!cyRef.current) return;
		const nodeIds: string[] = [];
		cyRef.current.nodes().forEach(node => {
			const id = node.id();
			if (!id.startsWith("cluster_") && !id.startsWith("preview_") && !node.data("isChatNode"))
				nodeIds.push(id);
		});
		const nodeIdSet = new Set(nodeIds);
		const edgeList: Array<{ source: string; target: string }> = [];
		cyRef.current.edges().forEach(edge => {
			if (edge.hasClass("chat-node-edge") || edge.id().startsWith("preview_e_")) return;
			const src = edge.data("source") as string;
			const tgt = edge.data("target") as string;
			if (nodeIdSet.has(src) && nodeIdSet.has(tgt)) edgeList.push({ source: src, target: tgt });
		});

		const labels = labelPropagation(nodeIds, edgeList);

		const communities = new Map<string, string[]>();
		labels.forEach((communityId, nodeId) => {
			if (!communities.has(communityId)) communities.set(communityId, []);
			communities.get(communityId)!.push(nodeId);
		});

		const groups = new Map<string, ClusterEntry>();
		communities.forEach((memberIds, communityId) => {
			let cx = 0, cySum = 0, bestDegree = -1, hubLabel = "Cluster", hubNodeId = memberIds[0];
			memberIds.forEach(id => {
				const node = cyRef.current!.$id(id);
				const pos = node.position();
				cx += pos.x;
				cySum += pos.y;
				const deg = node.degree(false);
				if (deg > bestDegree) {
					bestDegree = deg;
					hubLabel = (node.data("fullLabel") as string) || "Cluster";
					hubNodeId = id;
				}
			});
			groups.set(communityId, {
				nodeIds: memberIds,
				centroid: { x: cx / memberIds.length, y: cySum / memberIds.length },
				label: hubLabel,
				hubNodeId,
			});
		});
		clusterGroupsRef.current = groups;
	};

	const enterClustered = () => {
		if (!cyRef.current) return;
		computeClusterGroups();

		// Build reverse lookup: nodeId → communityId (key in clusterGroupsRef)
		const nodeToCluster = new Map<string, string>();
		clusterGroupsRef.current.forEach((entry, communityId) => {
			entry.nodeIds.forEach(id => nodeToCluster.set(id, communityId));
		});

		// Precompute dashed edges between distinct multi-member clusters
		const crossGroupEdges = new Set<string>();
		cyRef.current.edges().forEach(edge => {
			if (edge.hasClass("chat-node-edge") || edge.id().startsWith("preview_e_")) return;
			const sg = nodeToCluster.get(edge.data("source") as string);
			const tg = nodeToCluster.get(edge.data("target") as string);
			if (!sg || !tg || sg === tg) return;
			const sgEntry = clusterGroupsRef.current.get(sg);
			const tgEntry = clusterGroupsRef.current.get(tg);
			if (sgEntry && sgEntry.nodeIds.length > 1 && tgEntry && tgEntry.nodeIds.length > 1) {
				crossGroupEdges.add([sg, tg].sort().join("::"));
			}
		});

		crossGroupEdgesRef.current = crossGroupEdges;

		// Precompute singleton IDs and edges between singletons
		const singletonIds = new Set<string>();
		clusterGroupsRef.current.forEach(entry => {
			if (entry.nodeIds.length === 1) singletonIds.add(entry.nodeIds[0]);
		});
		const singletonEdgeIds = new Set<string>();
		cyRef.current.edges().forEach(edge => {
			if (edge.hasClass("chat-node-edge") || edge.id().startsWith("preview_e_")) return;
			const src = edge.data("source") as string;
			const tgt = edge.data("target") as string;
			if (singletonIds.has(src) && singletonIds.has(tgt)) {
				singletonEdgeIds.add(edge.id());
			}
		});

		expandedGroupsRef.current = new Set();

		cyRef.current.batch(() => {
			// Remove any previously added cluster nodes (their edges are removed with them)
			cyRef.current!.remove(".cluster-node");

			// Hide all original nodes and edges
			cyRef.current!.nodes().forEach(node => {
				if (!node.data("isChatNode") && !node.id().startsWith("preview_")) {
					node.hide();
				}
			});
			cyRef.current!.edges().forEach(edge => {
				if (!edge.hasClass("chat-node-edge") && !edge.id().startsWith("preview_e_")) {
					edge.hide();
				}
			});

			// Show singleton nodes and their mutual edges
			singletonIds.forEach(id => (cyRef.current!.$id(id) as any).show());
			singletonEdgeIds.forEach(id => (cyRef.current!.$id(id) as any).show());

			// Add cluster summary nodes for multi-member groups
			clusterGroupsRef.current.forEach((entry, communityId) => {
				if (entry.nodeIds.length <= 1) return;
				const displayLabel = entry.label ?? communityId;
				cyRef.current!.add({
					group: "nodes",
					data: {
						id: `cluster_${communityId}`,
						label: `${displayLabel}\n(${entry.nodeIds.length})`,
						fullLabel: displayLabel,
						group: communityId,
						memberCount: entry.nodeIds.length,
						isCluster: true,
						hubNodeId: entry.hubNodeId ?? entry.nodeIds[0],
						memberIds: entry.nodeIds,
						priority: 3,
					},
					position: { ...entry.centroid },
					classes: "cluster-node",
				});
			});

			// Add dashed edges between cluster summary nodes
			crossGroupEdges.forEach(key => {
				const [g1, g2] = key.split("::");
				if (cyRef.current!.$id(`cluster_${g1}`).length && cyRef.current!.$id(`cluster_${g2}`).length) {
					cyRef.current!.add({
						group: "edges",
						data: {
							id: `cluster_e_${key}`,
							source: `cluster_${g1}`,
							target: `cluster_${g2}`,
							label: "",
							fullLabel: "",
						},
					});
				}
			});
		});

		clusterGroupsRef.current.forEach((entry, communityId) => {
			if (entry.nodeIds.length <= 1) return;
			const clusterNode = cyRef.current!.$id(`cluster_${communityId}`);
			const hubId = entry.hubNodeId ?? "";
			if (cachedNodeIdsRef.current.has(hubId)) clusterNode.addClass("has-summary");
			if (loadingClusterHubIdRef.current === hubId) clusterNode.addClass("loading-background");
		});

		if (filePathRef.current) {
			localStorage.setItem(`odin_cluster_mode_${filePathRef.current}`, "true");
		}
		isModeClusteredRef.current = true;
		setIsClustered(true);
		setExpandedCount(0);
		setExpandedClusterList([]);
		setShowClusterMenu(false);
		onClusterModeChangeRef.current?.(true);
	};

	const expandCluster = (group: string) => {
		if (!cyRef.current) return;
		const entry = clusterGroupsRef.current.get(group);
		if (!entry || entry.nodeIds.length <= 1) return;

		cyRef.current.batch(() => {
			// Remove the cluster node (also removes its incident cluster edges)
			cyRef.current!.$id(`cluster_${group}`).remove();

			// Show the member nodes
			entry.nodeIds.forEach(id => (cyRef.current!.$id(id) as any).show());

			// Show edges where both endpoints are now visible
			cyRef.current!.edges().forEach(edge => {
				if (edge.hasClass("chat-node-edge") || edge.id().startsWith("cluster_e_") || edge.id().startsWith("preview_e_")) return;
				if (!edge.source().hidden() && !edge.target().hidden()) {
					(edge as any).show();
				}
			});
		});

		expandedGroupsRef.current.add(group);
		syncExpandedState();
	};

	const collapseCluster = (group: string) => {
		if (!cyRef.current) return;
		const entry = clusterGroupsRef.current.get(group);
		if (!entry || entry.nodeIds.length <= 1) return;

		const memberSet = new Set(entry.nodeIds);

		cyRef.current.batch(() => {
			// Hide member nodes
			entry.nodeIds.forEach(id => (cyRef.current!.$id(id) as any).hide());

			// Hide original edges where either endpoint is a now-hidden member
			cyRef.current!.edges().forEach(edge => {
				if (edge.hasClass("chat-node-edge") || edge.id().startsWith("cluster_e_") || edge.id().startsWith("preview_e_")) return;
				if (memberSet.has(edge.source().id()) || memberSet.has(edge.target().id())) {
					(edge as any).hide();
				}
			});

			// Re-add the cluster bubble node
			const hubNodeId = entry.hubNodeId ?? entry.nodeIds[0];
			const displayLabel = entry.label ?? group;
			cyRef.current!.add({
				group: "nodes",
				data: {
					id: `cluster_${group}`,
					label: `${displayLabel}\n(${entry.nodeIds.length})`,
					fullLabel: displayLabel,
					group,
					memberCount: entry.nodeIds.length,
					isCluster: true,
					hubNodeId,
					memberIds: entry.nodeIds,
					priority: 3,
				},
				position: { ...entry.centroid },
				classes: "cluster-node",
			});

			// Re-add cross-group edges to/from this cluster where the other endpoint exists
			crossGroupEdgesRef.current.forEach(key => {
				const [g1, g2] = key.split("::");
				if (g1 !== group && g2 !== group) return;
				const otherId = g1 === group ? `cluster_${g2}` : `cluster_${g1}`;
				if (!cyRef.current!.$id(otherId).length) return;
				const edgeId = `cluster_e_${key}`;
				if (cyRef.current!.$id(edgeId).length) return;
				cyRef.current!.add({
					group: "edges",
					data: {
						id: edgeId,
						source: `cluster_${g1}`,
						target: `cluster_${g2}`,
						label: "",
						fullLabel: "",
					},
				});
			});

			// Restore visual state classes on the freshly created cluster node
			const clusterNode = cyRef.current!.$id(`cluster_${group}`);
			if (cachedNodeIdsRef.current.has(hubNodeId)) clusterNode.addClass("has-summary");
			if (loadingClusterHubIdRef.current === hubNodeId) clusterNode.addClass("loading-background");
		});

		expandedGroupsRef.current.delete(group);
		syncExpandedState();
		onClusterCollapsedRef.current?.(group);
	};

	const syncExpandedState = () => {
		const list: { communityId: string; label: string }[] = [];
		expandedGroupsRef.current.forEach(communityId => {
			const entry = clusterGroupsRef.current.get(communityId);
			if (entry) list.push({ communityId, label: entry.label ?? communityId });
		});
		setExpandedClusterList(list);
		setExpandedCount(expandedGroupsRef.current.size);
	};

	// Auto-close menu when all expanded clusters are re-clustered
	useEffect(() => {
		if (expandedClusterList.length === 0) setShowClusterMenu(false);
	}, [expandedClusterList.length]);

	// Close menu on click outside
	useEffect(() => {
		if (!showClusterMenu) return;
		const handler = (e: MouseEvent) => {
			if (clusterMenuRef.current && !clusterMenuRef.current.contains(e.target as globalThis.Node)) {
				setShowClusterMenu(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showClusterMenu]);

	// Keep refs current so the Cytoscape click handler (registered once) can call latest versions
	useEffect(() => { expandClusterRef.current = expandCluster; });
	useEffect(() => { collapseClusterRef.current = collapseCluster; });

	const collapseAll = () => {
		enterClustered();
	};

	const exitClustered = () => {
		if (!cyRef.current) return;
		cyRef.current.batch(() => {
			cyRef.current!.remove(".cluster-node");
			(cyRef.current!.nodes() as any).show();
			(cyRef.current!.edges() as any).show();
		});
		expandedGroupsRef.current = new Set();
		if (filePathRef.current) {
			localStorage.removeItem(`odin_cluster_mode_${filePathRef.current}`);
		}
		isModeClusteredRef.current = false;
		setIsClustered(false);
		setExpandedCount(0);
		setExpandedClusterList([]);
		setShowClusterMenu(false);
		onClusterModeChangeRef.current?.(false);
	};

	const handleClusterToggle = () => {
		if (isModeClusteredRef.current) {
			if (expandedGroupsRef.current.size > 0) {
				setShowClusterMenu(prev => !prev);
			} else {
				exitClustered();
			}
		} else {
			enterClustered();
		}
	};

	// --- Cytoscape event handlers ---

	const registerNodeClickHandler = () => {
		const handleNodeClick = (event: cytoscape.EventObject) => {
			const nodeData = event.target.data();
			if (nodeData.isCluster) {
				const communityId = nodeData.group as string;
				onClusterClickRef.current?.({
					communityId,
					memberIds: (nodeData.memberIds as string[]) ?? clusterGroupsRef.current.get(communityId)?.nodeIds ?? [],
					label: nodeData.fullLabel as string,
					hubNodeId: nodeData.hubNodeId as string,
					expand: () => expandClusterRef.current(communityId),
					collapse: () => collapseClusterRef.current(communityId),
				});
				return;
			}
			// If in cluster mode, check if this node belongs to an expanded cluster
			if (isModeClusteredRef.current) {
				const clickedId = (event.target as cytoscape.NodeSingular).id();
				for (const [communityId, entry] of clusterGroupsRef.current) {
					if (expandedGroupsRef.current.has(communityId) && entry.nodeIds.includes(clickedId)) {
						onClusterClickRef.current?.({
							communityId,
							memberIds: entry.nodeIds,
							label: entry.label ?? communityId,
							hubNodeId: entry.hubNodeId ?? entry.nodeIds[0],
							expand: () => expandClusterRef.current(communityId),
							collapse: () => collapseClusterRef.current(communityId),
							alreadyExpanded: true,
						});
						return;
					}
				}
			}
			if (nodeData.priority === 1) {
				let path = nodeData.path.split(/(\\|\/)/g).pop();
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
			if (node.data("isCluster")) {
				node.connectedEdges().addClass("hovered");
				return;
			}
			node.outgoers("edge").addClass("hovered");
			node.incomers("edge").addClass("hovered-incoming");
			node.outgoers("node").addClass("hover-neighbor-outgoing");
			node.incomers("node").addClass("hover-neighbor-incoming");
			const currentActiveId = activeNodeIdRef.current;
			let excluded = node.union(node.connectedEdges()).union(node.outgoers("node")).union(node.incomers("node"));
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length && !activeNode.hidden()) {
					excluded = excluded.union(activeNode).union(activeNode.connectedEdges()).union(activeNode.outgoers("node")).union(activeNode.incomers("node"));
				}
			}
			cyRef.current?.elements().not(excluded).addClass("dimmed");
		});
		cyRef.current?.on("mouseout", "node", (event) => {
			const c2 = cyRef.current?.container(); if (c2) c2.style.cursor = "";
			const node = event.target;
			node.removeClass("hovered");
			if (node.data("isCluster")) {
				node.connectedEdges().removeClass("hovered");
				return;
			}
			node.outgoers("edge").removeClass("hovered");
			node.incomers("edge").removeClass("hovered-incoming");
			node.outgoers("node").removeClass("hover-neighbor-outgoing");
			node.incomers("node").removeClass("hover-neighbor-incoming");
			cyRef.current?.elements().removeClass("dimmed");
			const currentActiveId = activeNodeIdRef.current;
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length && !activeNode.hidden()) {
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
			if (event.target.data("isCluster")) return;
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

		cyRef.current?.on("dragfree", "node", (event) => {
			const positions: Record<string, { x: number; y: number }> = {};
			cyRef.current?.nodes().forEach(node => { positions[node.id()] = node.position(); });
			positionCacheRef.current.set(cacheKeyRef.current, positions);
			const fp = filePathRef.current;
			if (fp) {
				localStorage.setItem(`odin_graph_positions_${fp}`, JSON.stringify(positions));
			}
			const target = event.target as cytoscape.NodeSingular;
			if (target.data("isCluster")) {
				const communityId = target.data("group") as string;
				const pos = target.position();
				const entry = clusterGroupsRef.current.get(communityId);
				if (entry) entry.centroid = { x: pos.x, y: pos.y };
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
				// Reset cluster state when graph data changes
				isModeClusteredRef.current = false;
				expandedGroupsRef.current = new Set();
				clusterGroupsRef.current = new Map();
				setIsClustered(false);
				setExpandedCount(0);

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
					if (edge.target().data("isChatNode")) edge.addClass("chat-node-edge");
				});

				const hasAllPositions = !!cached && data.nodes.every(
					n => !!(cached as Record<string, {x:number;y:number}>)[n.data.id]
				);
				const isPreviewOnly = data.nodes.length > 0 &&
					data.nodes.every(n => (n.data.id as string)?.startsWith("preview_"));
				if (hasAllPositions) {
					cyRef.current.layout({ name: "preset", positions: cached!, fit: true, padding: 30 }).run();
				} else if (isPreviewOnly) {
					cyRef.current.layout({ ...LAYOUT_OPTIONS, tile: false, numIter: 2000 } as typeof LAYOUT_OPTIONS).run();
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

				const fp = filePathRef.current;
				const hasRealNodes = data.nodes.some(n => !(n.data.id as string).startsWith("preview_"));
				if (fp && hasRealNodes && localStorage.getItem(`odin_cluster_mode_${fp}`) === "true") {
					enterClustered();
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
					if (node.data("isCluster")) {
						const hubId = node.data("hubNodeId") as string;
						if (cachedNodeIds?.has(hubId)) node.addClass("has-summary");
						else node.removeClass("has-summary");
						return;
					}
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
		cyRef.current.nodes().forEach(node => {
			if (node.data("isCluster")) return;
			node.removeClass("loading-background");
		});
		if (loadingNodeId) {
			const node = cyRef.current.$id(loadingNodeId);
			if (node.length) node.addClass("loading-background");
		}
	}, [loadingNodeId, data]);

	useEffect(() => {
		if (!cyRef.current) return;
		cyRef.current.nodes().forEach(node => {
			if (!node.data("isCluster")) return;
			const hubId = node.data("hubNodeId") as string;
			if (loadingClusterHubId && hubId === loadingClusterHubId) {
				node.addClass("loading-background");
			} else {
				node.removeClass("loading-background");
			}
		});
	}, [loadingClusterHubId, data]);

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
				if (activeNode.length && !activeNode.hidden()) {
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

	const canCluster = data.nodes.length > 0 &&
		!data.nodes.every(n => n.data.id.startsWith("preview_")) &&
		data.nodes.some(n => !n.data.isChatNode && !n.data.id.startsWith("preview_"));

	return (
		<GraphOuter>
			<GraphContainer id="cy" $visible={visible} />
			{canCluster && (
				<ClusterToggleButton
					onClick={handleClusterToggle}
					$active={isClustered}
					title={isClustered
						? (expandedCount > 0 ? "Manage expanded clusters" : "Exit cluster view")
						: "Cluster nodes by type"}
				>
					<ClusterIcon />
				</ClusterToggleButton>
			)}
			{isClustered && expandedCount > 0 && (
				<CollapseAllButton onClick={collapseAll} title="Collapse all expanded clusters">
					Collapse All
				</CollapseAllButton>
			)}
			{isClustered && showClusterMenu && (
				<ClusterMenuDropdown ref={clusterMenuRef}>
					{expandedClusterList.length > 0 && (
						<>
							<ClusterMenuLabel>Expanded clusters</ClusterMenuLabel>
							{expandedClusterList.map(({ communityId, label }) => (
								<ClusterMenuRow key={communityId}>
									<ClusterMenuRowLabel title={label}>{label}</ClusterMenuRowLabel>
									<ClusterMenuReClusterBtn onClick={() => collapseCluster(communityId)}>
										Re-Cluster
									</ClusterMenuReClusterBtn>
								</ClusterMenuRow>
							))}
							<ClusterMenuSeparator />
						</>
					)}
					<ClusterMenuActionBtn onClick={() => { collapseAll(); setShowClusterMenu(false); }}>
						Collapse All
					</ClusterMenuActionBtn>
					<ClusterMenuActionBtn onClick={() => { exitClustered(); setShowClusterMenu(false); }}>
						Exit Cluster Mode
					</ClusterMenuActionBtn>
				</ClusterMenuDropdown>
			)}
		</GraphOuter>
	);
};

export default Graph;
