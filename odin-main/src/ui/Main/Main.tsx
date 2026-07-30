import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Graph from "../Graph/Graph";
import PromptBar from "../PromptBar/PromptBar";
import ChatPanel, { ChatEntry } from "../ChatPanel/ChatPanel";
import * as S from "./Main.styles";
import { useApp } from "../hooks/useApp";
import { Edge, Node, ClusterClickInfo } from "src/shared/types/graphTypes";
import { fetchData } from "src/util/fetchData";
import { FileSystemAdapter, Notice, TAbstractFile, TFile, requestUrl } from "obsidian";
import getEditorPosition from "src/util/getEditorPosition";
import * as Messages from "src/shared/messages";
import { fetchGraphData } from "./MainUtils";
import * as Constants from "src/shared/constants";
import { EdgeSingular, NodeSingular } from "cytoscape";
import { Selection } from "src/shared/types/Selection";
import { Sentence } from "src/model/Sentence";

const Main: React.FC = (): React.JSX.Element => {
	const app = useApp();
	const [data, setData] = useState<{ nodes: Node[]; edges: Edge[] }>({
		nodes: [],
		edges: [],
	});
	const [selectedFile, setSelectedFile] = useState<string>(
		app?.workspace.activeEditor?.file?.path || ""
	);
	const [graphLoading, setGraphLoading] = useState<boolean>(false);
	const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
	const [regeneratingFile, setRegeneratingFile] = useState<string | null>(null);
	const [firstRender, setFirstRender] = useState<boolean>(true);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryLoading, setSummaryLoading] = useState(false);
	const [disabled, setDisabled] = useState<boolean>(true);
	const [activeNodeId, setActiveNodeId] = useState<string | undefined>(undefined);
	const [copied, setCopied] = useState<boolean>(false);
	const [cachedNodeIds, setCachedNodeIds] = useState<Set<string>>(new Set());
	const [hasNonTitleContent, setHasNonTitleContent] = useState<boolean>(false);
	const [sideTab, setSideTab] = useState<"summary" | "chat">("summary");
	const [chatHistory, setChatHistory] = useState<Map<string, ChatEntry[]>>(new Map());
	const chatMessages = chatHistory.get(selectedFile) ?? [];
	const setChatMessages: React.Dispatch<React.SetStateAction<ChatEntry[]>> = (action) => {
		setChatHistory(prev => {
			const next = new Map(prev);
			const current = prev.get(selectedFile) ?? [];
			next.set(selectedFile, typeof action === "function" ? action(current) : action);
			return next;
		});
	};
	const [chatError, setChatError] = useState("");
	const [chatHighlightedNodeIds, setChatHighlightedNodeIds] = useState<Set<string>>(new Set());
	const [selectionHighlightedNodeIds, setSelectionHighlightedNodeIds] = useState<Set<string>>(new Set());
	const [activeChatNodes, setActiveChatNodes] = useState<
		Array<{ name: string; nodeType: string; relatedTo: string; relationship: string }> | null
	>(null);

	const displayData = useMemo(() => {
		if (!activeChatNodes?.length) return data;
		const existingNames = new Set(data.nodes.map(n => n.data.fullLabel.toLowerCase()));
		const wordSet = (s: string) => new Set(s.replace(/-/g, " ").split(/\s+/).filter(Boolean));
		const isExistingName = (name: string): boolean => {
			const nl = name.toLowerCase();
			if (existingNames.has(nl)) return true;
			const nw = wordSet(nl);
			for (const ex of existingNames) {
				const ew = wordSet(ex);
				if (ew.size && nw.size && ([...ew].every(w => nw.has(w)) || [...nw].every(w => ew.has(w)))) return true;
			}
			return false;
		};
		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		activeChatNodes.forEach((cn, i) => {
			if (isExistingName(cn.name)) return;
			const nodeId = `chat-active-${i}`;
			newNodes.push({
				data: { id: nodeId, label: cn.name.length > 15 ? cn.name.slice(0, 12) + "…" : cn.name,
						fullLabel: cn.name, priority: 2, isChatNode: true },
				classes: "chat-node",
			});
			const relatedNode = cn.relatedTo ? (
				data.nodes.find(n => n.data.fullLabel.toLowerCase() === cn.relatedTo.toLowerCase()) ||
				data.nodes.find(n =>
					n.data.fullLabel.toLowerCase().includes(cn.relatedTo.toLowerCase()) ||
					cn.relatedTo.toLowerCase().includes(n.data.fullLabel.toLowerCase())
				)
			) : undefined;
			const sourceId = relatedNode?.data.id ??
				(chatHighlightedNodeIds.size > 0 ? [...chatHighlightedNodeIds][0] : undefined);
			if (sourceId) {
				newEdges.push({ data: { id: `chat-active-edge-${i}`,
					label: cn.relationship || "RELATED_TO",
					fullLabel: cn.relationship || "RELATED_TO",
					source: sourceId, target: nodeId },
					classes: "chat-node-edge" });
			}
		});
		if (newNodes.length === 0) return data;
		return { nodes: [...data.nodes, ...newNodes], edges: [...data.edges, ...newEdges] };
	}, [data, activeChatNodes, chatHighlightedNodeIds]);
	const [chatLoadingMap, setChatLoadingMap] = useState<Map<string, boolean>>(new Map());
	const chatLoading = chatLoadingMap.get(selectedFile) ?? false;
	const setChatLoading: React.Dispatch<React.SetStateAction<boolean>> = (action) => {
		setChatLoadingMap(prev => {
			const next = new Map(prev);
			const current = prev.get(selectedFile) ?? false;
			next.set(selectedFile, typeof action === "function" ? action(current) : action);
			return next;
		});
	};
	const disabledRef = useRef<boolean>(true);
	const pendingReloadRef = useRef<Set<string>>(new Set());
	const graphCacheRef = useRef<Map<string, { nodes: Node[]; edges: Edge[] }>>(new Map());
	const activeNodePerFileRef = useRef<Map<string, { nodeId: string; summary: string | null; loading: boolean }>>(new Map());
	const nodeSummaryCacheRef = useRef<Map<string, string | null>>(new Map());
	const lastHighlightedEditorRef = useRef<any>(null);
	const graphRef = useRef<{ clearNodeHighlight: () => void; simulateBackgroundClick: () => void; resizeCy: () => void }>(null);
	const selectionChangeCleanupRef = useRef<(() => void) | null>(null);
	const handleActiveNodeIdChangeRef = useRef<(id: string | undefined) => void>(() => {});
	const clearHighlightRef = useRef<() => void>(() => {});
	const selectedFileRef = useRef<string>(selectedFile);
	const abortControllerRef = useRef<AbortController | null>(null);
	const summaryAbortControllerRef = useRef<AbortController | null>(null);
	const summaryLoadingNodeRef = useRef<{ file: string; nodeId: string } | null>(null);
	const graphEverExistedRef = useRef<Set<string>>(new Set());
	const [backgroundLoadingMap, setBackgroundLoadingMap] = useState<Map<string, string>>(new Map());
	const [activeCluster, setActiveCluster] = useState<ClusterClickInfo | null>(null);
	const [clusterSummary, setClusterSummary] = useState<string | null>(null);
	const [clusterSummaryLoading, setClusterSummaryLoading] = useState(false);
	const [clusterLoadingHubId, setClusterLoadingHubId] = useState<string | null>(null);
	const [clusterExpanded, setClusterExpanded] = useState(false);
	const [clusterCopied, setClusterCopied] = useState(false);
	const clusterSummaryAbortRef = useRef<AbortController | null>(null);
	const activeClusterRef = useRef<ClusterClickInfo | null>(null);
	useEffect(() => { activeClusterRef.current = activeCluster; }, [activeCluster]);
	const clusterExpandedRef = useRef(false);
	useEffect(() => { clusterExpandedRef.current = clusterExpanded; }, [clusterExpanded]);
	const clusterLoadingHubIdRef = useRef<string | null>(null);
	const backgroundLoadingNodeId = backgroundLoadingMap.get(selectedFile);
	const activeNodeIdRef = useRef<string | undefined>(undefined);
	useEffect(() => { activeNodeIdRef.current = activeNodeId; }, [activeNodeId]);
	const isAnythingHighlightedRef = useRef(false);
	useEffect(() => {
		isAnythingHighlightedRef.current =
			!!activeNodeId ||
			selectionHighlightedNodeIds.size > 0 ||
			chatHighlightedNodeIds.size > 0;
	}, [activeNodeId, selectionHighlightedNodeIds, chatHighlightedNodeIds]);
	const [sidePanelWidth, setSidePanelWidth] = useState(260);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
	useLayoutEffect(() => {
		graphRef.current?.resizeCy();
	}, [sidePanelWidth]);
	const root =
		app?.vault.adapter instanceof FileSystemAdapter
			? app.vault.adapter.getBasePath().replaceAll("\\", "/")
			: "/";

	const handleResizeMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		dragRef.current = { startX: e.clientX, startWidth: sidePanelWidth };
		document.body.style.userSelect = "none";
		const onMouseMove = (ev: MouseEvent) => {
			if (!dragRef.current) return;
			const delta = dragRef.current.startX - ev.clientX;
			const newWidth = Math.min(600, Math.max(160, dragRef.current.startWidth + delta));
			setSidePanelWidth(newWidth);
		};
		const onMouseUp = () => {
			dragRef.current = null;
			document.body.style.userSelect = "";
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	const onNodeClickCallback = async (node: NodeSingular) => {
		if (node.data().isChatNode) return;
		if (node.data().id?.startsWith('preview_')) return;
		selectionChangeCleanupRef.current?.();
		selectionChangeCleanupRef.current = null;
		lastHighlightedEditorRef.current = null;
		clearActiveCluster();
		const capturedFile = selectedFile;
		const nodeId = node.data().id;

		// Capture loading state BEFORE resetting the ref so we can detect a
		// concurrent regeneration that was already in flight when this click fired.
		const priorEntry = activeNodePerFileRef.current.get(capturedFile);
		const summaryAlreadyInProgress =
			priorEntry?.nodeId === nodeId && priorEntry?.loading === true;

		setActiveNodeId(nodeId);
		if (summaryLoadingNodeRef.current?.file !== capturedFile) {
			setBackgroundLoadingMap(prev => { const n = new Map(prev); n.delete(capturedFile); return n; });
		}
		if (!summaryAlreadyInProgress) {
			activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: null, loading: false });
		} else {
			const entry = activeNodePerFileRef.current.get(capturedFile);
			if (entry) activeNodePerFileRef.current.set(capturedFile, { ...entry, backgroundDeselected: false });
			setSummaryLoading(true);
			setSummary(null);
		}

		let ignoreResults = false;
		{
			setDisabled(true);
			const active = selectedFile;
			const fetchBody = {
				repo: {
					path: root,
					type: "Notes",
				},
				id: nodeId,
			};

			await fetchData(
				"http://localhost:8000/knowledge_base/notes/node_to_sentences",
				fetchBody
			)
				.then((data) => {
					const selections: Selection[] = [];
					data.forEach((element: Sentence) => {
						const pos = getEditorPosition(
							app?.workspace.activeEditor?.editor?.getValue() || "",
							element.content
						);
						if (pos) selections.push(pos);
					});

					if (active === selectedFile && !ignoreResults && selections.length > 0) {
						const ed = app?.workspace.activeEditor?.editor;
						if (ed) {
							lastHighlightedEditorRef.current = ed;
							ed.setSelections(selections);
						}
					}
				})
				.catch(() => {
					new Notice(Messages.fetchFailed);
				});
			setDisabled(false);
		}

		if (lastHighlightedEditorRef.current) {
			const highlightedEd = lastHighlightedEditorRef.current;
			const pollId = window.setInterval(() => {
				if (!highlightedEd.somethingSelected()) {
					window.clearInterval(pollId);
					selectionChangeCleanupRef.current = null;
					graphRef.current?.simulateBackgroundClick();
				}
			}, 200);
			selectionChangeCleanupRef.current = () => window.clearInterval(pollId);
		}

		const cacheKey = `${capturedFile}::${nodeId}`;

		// If a regeneration was already in flight when this click fired, skip the
		// summary fetch entirely to prevent a duplicate API call.
		if (summaryAlreadyInProgress) {
			return () => { ignoreResults = true; };
		}

		const isLoadingInBackground =
			summaryLoadingNodeRef.current?.file === capturedFile &&
			summaryLoadingNodeRef.current?.nodeId === nodeId;
		if (isLoadingInBackground) {
			activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: null, loading: true });
			setSummaryLoading(true);
			setSummary(null);
			return () => { ignoreResults = true; };
		}

		if (nodeSummaryCacheRef.current.has(cacheKey)) {
			const cached = nodeSummaryCacheRef.current.get(cacheKey) ?? null;
			setSummary(cached);
			setSummaryLoading(false);
			activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: cached, loading: false });
			return () => { ignoreResults = true; };
		}

		setSummary(null);
		setSummaryLoading(false);

		return () => {
			ignoreResults = true;
		};
	};

	const fetchAndCacheSummary = (nodeId: string, capturedFile: string, variation = false) => {
		const cacheKey = `${capturedFile}::${nodeId}`;
		setSummary(null);
		setSummaryLoading(true);
		activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: null, loading: true });
		summaryAbortControllerRef.current?.abort();
		const ac = new AbortController();
		summaryAbortControllerRef.current = ac;
		summaryLoadingNodeRef.current = { file: capturedFile, nodeId };
		fetchData(
			"http://localhost:8000/knowledge_base/notes/node_summary",
			{ repo: { path: root, type: "Notes" }, id: nodeId, regenerate: variation },
			undefined, undefined, ac.signal
		).then(result => {
			summaryLoadingNodeRef.current = null;
			const content = result?.content ?? null;
			nodeSummaryCacheRef.current.set(cacheKey, content);
			const currentEntry = activeNodePerFileRef.current.get(capturedFile);
			if (currentEntry?.nodeId === nodeId) {
				activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: content, loading: false });
			}
			if (selectedFileRef.current === capturedFile) {
				setBackgroundLoadingMap(prev => { const n = new Map(prev); if (n.get(capturedFile) === nodeId) n.delete(capturedFile); return n; });
				setCachedNodeIds(prev => new Set([...prev, nodeId]));
				if (activeNodeIdRef.current === nodeId) {
					setSummary(content);
					setSummaryLoading(false);
				}
			}
		}).catch((error: any) => {
			if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
			summaryLoadingNodeRef.current = null;
			new Notice("Failed to get node summary.");
			const currentEntry = activeNodePerFileRef.current.get(capturedFile);
			if (currentEntry?.nodeId === nodeId) {
				activeNodePerFileRef.current.set(capturedFile, { nodeId, summary: currentEntry.summary, loading: false });
			}
			if (selectedFileRef.current === capturedFile) {
				setBackgroundLoadingMap(prev => { const n = new Map(prev); if (n.get(capturedFile) === nodeId) n.delete(capturedFile); return n; });
				if (activeNodeIdRef.current === nodeId) setSummaryLoading(false);
			}
		});
	};

	const handleActivateChatNodes = (
		nodes: Array<{ name: string; nodeType: string; relatedTo: string; relationship: string }> | null
	) => {
		setActiveChatNodes(nodes);
	};

	const handleClearSummary = () => {
		setSummary(null);
		setSummaryLoading(false);
		if (activeNodeId) {
			const cacheKey = `${selectedFile}::${activeNodeId}`;
			nodeSummaryCacheRef.current.delete(cacheKey);
			setCachedNodeIds(prev => { const next = new Set(prev); next.delete(activeNodeId); return next; });
			activeNodePerFileRef.current.set(selectedFile, { nodeId: activeNodeId, summary: null, loading: false });
		}
	};

	const handleCopySummary = () => {
		if (!summary) return;
		navigator.clipboard.writeText(summary).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}).catch(() => {
			new Notice("Failed to copy summary.");
		});
	};

	const handleGetSummary = () => {
		if (!activeNodeId || data.nodes.find(n => n.data.id === activeNodeId)?.data.isChatNode) return;
		fetchAndCacheSummary(activeNodeId, selectedFile);
	};

	const clearActiveCluster = () => {
		setActiveCluster(null);
		setClusterSummary(null);
		setClusterSummaryLoading(false);
		setClusterExpanded(false);
		setClusterCopied(false);
	};

	const fetchClusterSummary = async (hubNodeId: string, regenerate = false) => {
		const capturedFile = selectedFile;
		const cacheKey = `${capturedFile}::${hubNodeId}`;
		if (!regenerate && nodeSummaryCacheRef.current.has(cacheKey)) {
			setClusterSummary(nodeSummaryCacheRef.current.get(cacheKey) ?? null);
			return;
		}
		if (clusterLoadingHubIdRef.current === hubNodeId) {
			clusterSummaryAbortRef.current?.abort();
		}
		const controller = new AbortController();
		clusterSummaryAbortRef.current = controller;
		clusterLoadingHubIdRef.current = hubNodeId;
		setClusterSummaryLoading(true);
		setClusterLoadingHubId(hubNodeId);
		setClusterSummary(null);
		try {
			const result = await fetchData(
				"http://localhost:8000/knowledge_base/notes/node_summary",
				{ repo: { path: root, type: "Notes" }, id: hubNodeId, regenerate },
				undefined, undefined, controller.signal
			);
			const content = result?.content ?? null;
			clusterLoadingHubIdRef.current = null;
			if (!controller.signal.aborted) {
				nodeSummaryCacheRef.current.set(cacheKey, content);
				setCachedNodeIds(prev => new Set([...prev, hubNodeId]));
				setClusterLoadingHubId(null);
				if (activeClusterRef.current?.hubNodeId === hubNodeId) {
					setClusterSummary(content);
					setClusterSummaryLoading(false);
				}
			}
		} catch (error: any) {
			if (clusterLoadingHubIdRef.current === hubNodeId) clusterLoadingHubIdRef.current = null;
			if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
			setClusterLoadingHubId(null);
			if (!controller.signal.aborted && activeClusterRef.current?.hubNodeId === hubNodeId) {
				setClusterSummaryLoading(false);
			}
		}
	};

	const handleCopyClusterSummary = () => {
		if (!clusterSummary) return;
		navigator.clipboard.writeText(clusterSummary).then(() => {
			setClusterCopied(true);
			setTimeout(() => setClusterCopied(false), 2000);
		}).catch(() => new Notice("Failed to copy summary."));
	};

	const handleRegenerateClusterSummary = () => {
		if (!activeCluster) return;
		const cacheKey = `${selectedFile}::${activeCluster.hubNodeId}`;
		nodeSummaryCacheRef.current.delete(cacheKey);
		setCachedNodeIds(prev => { const next = new Set(prev); next.delete(activeCluster.hubNodeId); return next; });
		setClusterSummary(null);
		fetchClusterSummary(activeCluster.hubNodeId, true);
	};

	const handleClearClusterSummary = () => {
		if (activeCluster) {
			const cacheKey = `${selectedFile}::${activeCluster.hubNodeId}`;
			nodeSummaryCacheRef.current.delete(cacheKey);
			setCachedNodeIds(prev => { const next = new Set(prev); next.delete(activeCluster.hubNodeId); return next; });
		}
		setClusterSummary(null);
	};

	const onClusterClickCallback = async (info: ClusterClickInfo) => {
		if (info.isDeselect) {
			clearActiveCluster();
			return;
		}
		setActiveCluster(info);
		setClusterExpanded(info.alreadyExpanded ?? false);
		setClusterCopied(false);
		setActiveNodeId(undefined);
		setSummary(null);
		setSummaryLoading(false);
		setSideTab("summary");
		const cacheKey = `${selectedFile}::${info.hubNodeId}`;
		const cached = nodeSummaryCacheRef.current.has(cacheKey)
			? (nodeSummaryCacheRef.current.get(cacheKey) ?? null)
			: null;
		setClusterSummary(cached);
		setClusterSummaryLoading(clusterLoadingHubIdRef.current === info.hubNodeId && !cached);

		const capturedFile = selectedFile;
		const hubNodePath = (data.nodes.find(n => n.data.id === info.hubNodeId)?.data.path as string | undefined)
			?.split(/(\\|\/)/g).pop();
		await app?.workspace.openLinkText("", hubNodePath ?? capturedFile);
		const editorContent = app?.workspace.activeEditor?.editor?.getValue() || "";
		try {
			const results = await fetchData(
				"http://localhost:8000/knowledge_base/notes/node_to_sentences",
				{ repo: { path: root, type: "Notes" }, id: info.hubNodeId }
			).catch(() => [] as Sentence[]);
			const matched = (results as Sentence[]).filter(el => Boolean(el.content));
			if (matched.length > 0) {
				const ed = app?.workspace.activeEditor?.editor;
				if (ed) {
					const selections = matched
						.map(el => getEditorPosition(editorContent, el.content))
						.filter((s): s is Selection => s !== null);
					if (selections.length > 0) {
						lastHighlightedEditorRef.current = ed;
						ed.setSelections(selections);
					}
				}
			}
		} catch {}
	};

	const handleRegenerateSummary = () => {
		if (!activeNodeId || data.nodes.find(n => n.data.id === activeNodeId)?.data.isChatNode) return;
		const capturedFile = selectedFile;
		const nodeId = activeNodeId;
		const cacheKey = `${capturedFile}::${nodeId}`;
		nodeSummaryCacheRef.current.delete(cacheKey);
		setCachedNodeIds(prev => { const next = new Set(prev); next.delete(nodeId); return next; });
		fetchAndCacheSummary(nodeId, capturedFile, true);
	};

	const handleStopSummary = () => {
		summaryAbortControllerRef.current?.abort();
		summaryAbortControllerRef.current = null;
		summaryLoadingNodeRef.current = null;
		setSummaryLoading(false);
		setBackgroundLoadingMap(prev => { const n = new Map(prev); n.delete(selectedFile); return n; });
		const entry = activeNodePerFileRef.current.get(selectedFile);
		if (entry?.loading) {
			activeNodePerFileRef.current.set(selectedFile, { ...entry, loading: false });
		}
	};

	const onEdgeClickCallback = async (edge: EdgeSingular) => {
		const srcId = edge.source().data().id as string | undefined;
		if (srcId?.startsWith('preview_') || srcId?.startsWith('cluster_')) return;

		const capturedFile = selectedFile;
		await app?.workspace.openLinkText("", capturedFile);
		const editorContent = app?.workspace.activeEditor?.editor?.getValue() || "";

		try {
			const [srcData, tgtData] = await Promise.all([
				fetchData(
					"http://localhost:8000/knowledge_base/notes/node_to_sentences",
					{ repo: { path: root, type: "Notes" }, id: srcId }
				).catch(() => [] as Sentence[]),
				fetchData(
					"http://localhost:8000/knowledge_base/notes/node_to_sentences",
					{ repo: { path: root, type: "Notes" }, id: edge.target().data().id }
				).catch(() => [] as Sentence[]),
			]);

			const srcContents = new Set((srcData as Sentence[]).map((s) => s.content));
			const shared = (tgtData as Sentence[]).filter((s) => srcContents.has(s.content));
			const results: Sentence[] = shared.length > 0 ? shared : [...srcData as Sentence[], ...tgtData as Sentence[]];

			const selections: Selection[] = results
				.map(el => getEditorPosition(editorContent, el.content))
				.filter((s): s is Selection => s !== null);
			if (selections.length > 0) {
				const ed = app?.workspace.activeEditor?.editor;
				if (ed) {
					lastHighlightedEditorRef.current = ed;
					ed.setSelections(selections);
				}
			}
		} catch {}
	};

	const handleActiveNodeIdChange = (id: string | undefined) => {
		setActiveNodeId(id);
		if (id === undefined) {
			const entry = activeNodePerFileRef.current.get(selectedFile);
			if (entry?.loading) {
				activeNodePerFileRef.current.set(selectedFile, { ...entry, backgroundDeselected: true });
				setBackgroundLoadingMap(prev => { const n = new Map(prev); n.set(selectedFile, entry.nodeId); return n; });
			} else {
				activeNodePerFileRef.current.delete(selectedFile);
			}
		} else {
			if (cachedNodeIds.has(id)) {
				setSideTab("summary");
			}
			if (summaryLoadingNodeRef.current?.file === selectedFile) {
				setBackgroundLoadingMap(prev => {
					const n = new Map(prev);
					n.set(selectedFile, summaryLoadingNodeRef.current!.nodeId);
					return n;
				});
			} else {
				setBackgroundLoadingMap(prev => { const n = new Map(prev); n.delete(selectedFile); return n; });
			}
		}
	};
	handleActiveNodeIdChangeRef.current = handleActiveNodeIdChange;

	const clearHighlight = () => {
		selectionChangeCleanupRef.current?.();
		selectionChangeCleanupRef.current = null;
		const tryDeselect = (ed: any) => {
			if (!ed) return;
			try {
				const cm = ed?.cm;
				if (cm?.state?.selection) {
					cm.dispatch({ selection: { anchor: cm.state.selection.main.head } });
				}
			} catch {}
			try {
				const pos = ed.getCursor('head');
				if (pos) ed.setCursor(pos);
			} catch {}
		};

		const ed = lastHighlightedEditorRef.current;
		if (ed) {
			tryDeselect(ed);
			lastHighlightedEditorRef.current = null;
			return;
		}
		app?.workspace.iterateAllLeaves((leaf: any) => {
			if (leaf.view?.getViewType?.() === 'markdown') {
				tryDeselect(leaf.view?.editor);
			}
		});
	};
	clearHighlightRef.current = clearHighlight;

	const updateHasNonTitleContent = async (filePath: string) => {
		if (!filePath || !app) { setHasNonTitleContent(false); return; }
		const abstractFile = app.vault.getAbstractFileByPath(filePath);
		if (!abstractFile || !(abstractFile instanceof TFile)) { setHasNonTitleContent(false); return; }
		const content = await app.vault.read(abstractFile);
		const lines = content.split("\n");
		let start = 0;
		if (lines[0]?.trim() === "---") {
			const end = lines.findIndex((l: string, i: number) => i > 0 && l.trim() === "---");
			if (end !== -1) start = end + 1;
		}
		if (lines[start]?.trim().startsWith("# ")) start++;
		setHasNonTitleContent(/\S+\s/.test(lines.slice(start).join("\n")));
	};

	const handleStop = () => {
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		const stoppedFile = regeneratingFile;
		setGraphLoading(false);
		setRegeneratingFile(null);
		setGenerationProgress(null);
		populateGraphData(false);
		if (stoppedFile) {
			fetchData(
				`http://localhost:8000/knowledge_base/notes/cancel_generation?path=${encodeURIComponent(root + "/" + stoppedFile)}`,
				undefined,
				"POST"
			).catch(() => {});
		}
	};

	const commands = [
		{
			title: "Regenerate Knowledge Graph",
			icon: "git-pull-request-arrow",
			callback: async (filePath: string) => {
				if (!filePath) {
					new Notice("No file is open.");
					return;
				}
					try {
					const controller = new AbortController();
					abortControllerRef.current = controller;
					setRegeneratingFile(filePath);
					setGraphLoading(true);
					if (filePath === selectedFileRef.current) {
						setSummary(null);
						setSummaryLoading(false);
						setActiveNodeId(undefined);
						activeNodePerFileRef.current.delete(filePath);
						setData({ nodes: [], edges: [] });
					}
					new Notice("Generating knowledge graph…");
					await fetchData(
						"http://localhost:8000/knowledge_base/notes/update_file",
						{ path: root + "/" + filePath, type: "Notes", content: "" },
						"PUT",
						900000,
						controller.signal
					);
					abortControllerRef.current = null;
					setGraphLoading(false);
					setRegeneratingFile(null);
					graphCacheRef.current.delete(filePath);
					activeNodePerFileRef.current.delete(filePath);
					nodeSummaryCacheRef.current.forEach((_, key) => {
						if (key.startsWith(`${filePath}::`)) nodeSummaryCacheRef.current.delete(key);
					});
					if (filePath === selectedFile) setCachedNodeIds(new Set());
					setChatHistory(prev => { const next = new Map(prev); next.delete(filePath); return next; });
					setChatLoadingMap(prev => { const next = new Map(prev); next.delete(filePath); return next; });
					if (filePath === selectedFile) setChatError("");
					setBackgroundLoadingMap(prev => { const n = new Map(prev); n.delete(filePath); return n; });
					const currentFile = selectedFileRef.current;
					if (currentFile === filePath) {
						setSelectedFile("");
						setTimeout(() => setSelectedFile(filePath), 100);
					} else {
						pendingReloadRef.current.add(filePath);
					}
				} catch (err: any) {
					setGraphLoading(false);
					setRegeneratingFile(null);
					abortControllerRef.current = null;
					if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
						new Notice("Failed to regenerate knowledge graph.");
					}
				}
			},
			data: "path",
		},
	];

	const handleFileEvent =
		(operation: string) => (file: TAbstractFile, oldPath?: string) => {
			let fetchBody;
			if (operation === "rename") {
				fetchBody = {
					old_file: { path: root + "/" + (oldPath || ""), type: "Notes", content: "" },
					new_file: { path: root + "/" + file.path, type: "Notes", content: "" },
				};
			} else {
				fetchBody = {
					path: root + "/" + file.path,
					type: "Notes",
					content: "",
				};
			}

			graphCacheRef.current.delete(file.path);
			if (oldPath) graphCacheRef.current.delete(oldPath);
			nodeSummaryCacheRef.current.forEach((_, key) => {
				if (key.startsWith(`${file.path}::`)) nodeSummaryCacheRef.current.delete(key);
			});
			if (oldPath) {
				nodeSummaryCacheRef.current.forEach((_, key) => {
					if (key.startsWith(`${oldPath}::`)) nodeSummaryCacheRef.current.delete(key);
				});
			}
			fetchData(
				`http://localhost:8000/knowledge_base/notes/${Constants.OPERATIONS_MAP[operation].url}_file`,
				fetchBody,
				Constants.OPERATIONS_MAP[operation].method
			).catch(() => {
				new Notice(Messages.updateFailed);
			});
			populateGraphData(false);
		};

	const populateGraphData = async (reload: boolean) => {
		let ignoreResults = false;
		setDisabled(true);
		if (reload) setGraphLoading(true);

		if (!reload && graphCacheRef.current.has(selectedFile)) {
			setData(graphCacheRef.current.get(selectedFile)!);
			setDisabled(false);
			return () => { ignoreResults = true; };
		}

		await fetchGraphData(root, selectedFile, ignoreResults, [])
			.then((result) => {
				const graphData = { nodes: result.nodes, edges: result.edges };
				graphCacheRef.current.set(selectedFile, graphData);
				setData(graphData);
				if (result.rawNodeCount > 0) {
					graphEverExistedRef.current.add(selectedFile);
				} else {
					graphEverExistedRef.current.delete(selectedFile);
				}
			})
			.catch(() => {
				new Notice(Messages.fetchFailed);
			});

		if (reload) setGraphLoading(false);
		setDisabled(false);

		return () => {
			ignoreResults = true;
		};
	};

	useEffect(() => {
		disabledRef.current = disabled;
	}, [disabled]);

	useEffect(() => {
		selectedFileRef.current = selectedFile;
	}, [selectedFile]);

	useEffect(() => {
		if (regeneratingFile && regeneratingFile === selectedFile) {
			setSummary(null);
			setSummaryLoading(false);
			setActiveNodeId(undefined);
			activeNodePerFileRef.current.delete(regeneratingFile);
		}
	}, [regeneratingFile, selectedFile]);

	useEffect(() => {
		if (!firstRender) {
			clearActiveCluster();
			setData({ nodes: [], edges: [] });
			setHasNonTitleContent(false);
			const saved = activeNodePerFileRef.current.get(selectedFile);
			if (saved && !saved.backgroundDeselected) {
				setActiveNodeId(saved.nodeId);
				setSummary(saved.summary);
				setSummaryLoading(saved.loading);
			} else {
				setActiveNodeId(undefined);
				setSummary(null);
				setSummaryLoading(false);
			}
			const filePrefix = `${selectedFile}::`;
			const restoredIds = new Set<string>();
			nodeSummaryCacheRef.current.forEach((_, key) => {
				if (key.startsWith(filePrefix)) restoredIds.add(key.slice(filePrefix.length));
			});
			setCachedNodeIds(restoredIds);
			updateHasNonTitleContent(selectedFile);
			populateGraphData(false);
		}
	}, [selectedFile]);

	useEffect(() => {
		setChatError("");
		setChatHighlightedNodeIds(new Set());
		setSelectionHighlightedNodeIds(new Set());
		setActiveChatNodes(null);
	}, [selectedFile]);

	useEffect(() => {
		setDisabled(true);
		const initRepo = async () => {
			await fetchData(
				"http://localhost:8000/knowledge_base/general/init_local_repo",
				{
					path: root,
					type: "Notes",
				}
			);
		};

		initRepo();

		const eventRefs: any[] = [];

		Constants.OPERATIONS.forEach((op: "rename") => {
			const ref = app?.vault.on(op, (file, oldPath?: string) => {
				if (op === "rename") {
					handleFileEvent(op)(file, oldPath);
				} else {
					handleFileEvent(op)(file);
				}
				populateGraphData(false);
			});
			if (ref) eventRefs.push(ref);
		});

		const fileOpenRef = app?.workspace.on("file-open", (file) => {
			const path = file?.path || "";
			selectedFileRef.current = path;
			if (pendingReloadRef.current.has(path)) {
				pendingReloadRef.current.delete(path);
				setSelectedFile("");
				setTimeout(() => setSelectedFile(path), 100);
			} else {
				setSelectedFile(path);
			}
		});
		if (fileOpenRef) eventRefs.push(fileOpenRef);



		const editorChangeRef = app?.workspace.on("editor-change", (editor, info) => {
			if (!selectedFileRef.current) return;
			const filePath = (info as any).file?.path;
			if (filePath !== undefined && filePath !== selectedFileRef.current) return;
			const content = editor.getValue();
			const lines = content.split("\n");
			let start = 0;
			if (lines[0]?.trim() === "---") {
				const end = lines.findIndex((l: string, i: number) => i > 0 && l.trim() === "---");
				if (end !== -1) start = end + 1;
			}
			if (lines[start]?.trim().startsWith("# ")) start++;
			setHasNonTitleContent(/\S+\s/.test(lines.slice(start).join("\n")));
		});
		if (editorChangeRef) eventRefs.push(editorChangeRef);

		commands.forEach((command) => {
			const ref = app?.workspace.on("editor-menu", (menu) => {
				const currentFilePath = app.workspace.activeEditor?.file?.path || "";
				if (!currentFilePath) return;
				const hasGraph = graphEverExistedRef.current.has(currentFilePath);
				menu.addItem((item) => {
					item.setTitle(hasGraph ? command.title : "Generate Knowledge Graph")
						.setIcon(command.icon)
						.onClick(() => {
							if (command.callback) {
								let arg =
									app.workspace.activeEditor?.file?.path;
								if (command.data === "selection")
									arg =
										app.workspace.activeEditor?.editor?.getSelection();
								command.callback(arg || "");
							}
						});
				});
			});
			if (ref) eventRefs.push(ref);
		});

		const findRef = app?.workspace.on("editor-menu", (menu) => {
			const editor = app.workspace.activeEditor?.editor;
			const selection = editor?.getSelection()?.trim();
			if (!selection) return;
			menu.addItem((item) => {
				item.setTitle("Find node in graph")
					.setIcon("search")
					.onClick(async () => {
						try {
							const query = selection.length > 2000 ? selection.slice(0, 2000) : selection;
							const response = await requestUrl({
								url: "http://localhost:8000/knowledge_base/notes/sentence_to_nodes",
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ repo: { path: root, type: "Notes" }, content: query }),
							});
							const results: any[] = response.json ?? [];
							if (!results.length) {
								new Notice("No matching node found for the selected text.");
								return;
							}
							const ids = new Set(results.map((r: any) => String(r.id)));
							setSelectionHighlightedNodeIds(ids);
						} catch (e: any) {
							const detail = e?.text || e?.message || String(e);
							new Notice("Find node in graph failed: " + detail);
							console.error("[ODIN] sentence_to_nodes error:", e);
						}
					});
			});
		});
		if (findRef) eventRefs.push(findRef);

		const unhighlightRef = app?.workspace.on("editor-menu", (menu) => {
			if (!isAnythingHighlightedRef.current) return;
			menu.addItem((item) => {
				item.setTitle("Unhighlight nodes in graph")
					.setIcon("eraser")
					.onClick(() => {
						graphRef.current?.simulateBackgroundClick();
					});
			});
		});
		if (unhighlightRef) eventRefs.push(unhighlightRef);

		let activePath = app?.workspace.activeEditor?.file?.path || "";
		if (!activePath) {
			// Plugin panel may have stolen focus on toggle — scan leaves for any open markdown note
			app?.workspace.iterateAllLeaves((leaf: any) => {
				if (!activePath && leaf.view?.getViewType?.() === "markdown" && leaf.view?.file?.path) {
					activePath = leaf.view.file.path;
				}
			});
		}
		setSelectedFile(activePath);
		updateHasNonTitleContent(activePath);
		setFirstRender(false);
		clearHighlight();
		setDisabled(false);
		if (!activePath || activePath === selectedFile) {
			if (activePath) populateGraphData(false);
		}

		const contentPollInterval = setInterval(() => {
			const currentPath = selectedFileRef.current;
			if (!currentPath || graphEverExistedRef.current.has(currentPath)) return;
			let content: string | null = null;
			app?.workspace.iterateAllLeaves((leaf: any) => {
				if (content !== null) return;
				if (
					leaf.view?.getViewType?.() === "markdown" &&
					leaf.view?.file?.path === currentPath &&
					leaf.view?.editor
				) {
					content = leaf.view.editor.getValue();
				}
			});
			if (content === null) return;
			const lines = (content as string).split("\n");
			let start = 0;
			if (lines[0]?.trim() === "---") {
				const end = lines.findIndex((l: string, i: number) => i > 0 && l.trim() === "---");
				if (end !== -1) start = end + 1;
			}
			if (lines[start]?.trim().startsWith("# ")) start++;
			setHasNonTitleContent(/\S+\s/.test(lines.slice(start).join("\n")));
		}, 300);

		return () => {
			eventRefs.forEach((ref) => app?.workspace.offref(ref));
			clearInterval(contentPollInterval);
		};
	}, []);

	useEffect(() => {
		if (!graphLoading) {
			setGenerationProgress(prev => prev ? { ...prev, percent: 100 } : null);
			const timer = setTimeout(() => setGenerationProgress(null), 3000);
			return () => clearTimeout(timer);
		}
		const interval = setInterval(async () => {
			if (!regeneratingFile) return;
			try {
				const result = await fetchData(
					`http://localhost:8000/knowledge_base/notes/generation_progress?path=${encodeURIComponent(root + "/" + regeneratingFile)}`,
					undefined,
					"GET"
				);
				if (result?.status === "generating") {
					setGenerationProgress(prev => {
						if (prev && result.percent < prev.percent) return prev;
						return { current: result.current, total: result.total, percent: result.percent };
					});
					const previewNodes: Array<{name: string, label: string}> = result.preview_nodes || [];
					const previewEdges: Array<{from: string, rel: string, to: string}> = result.preview_edges || [];
					if (previewNodes.length > 0 && regeneratingFile === selectedFileRef.current) {
						const previewNodeIds = new Set(previewNodes.map(n => `preview_${n.name}`));
						setData({
							nodes: previewNodes.map(n => ({
								data: {
									id: `preview_${n.name}`,
									label: n.name.length > 20 ? n.name.slice(0, 17) + '…' : n.name,
									fullLabel: n.name,
									priority: 1,
									selected: false,
									path: regeneratingFile,
								}
							})),
							edges: previewEdges
								.filter(e => previewNodeIds.has(`preview_${e.from}`) && previewNodeIds.has(`preview_${e.to}`))
								.map(e => ({
									data: {
										id: `preview_e_${e.from}_${e.rel}_${e.to}`,
										label: e.rel.length > 20 ? e.rel.slice(0, 17) + '…' : e.rel,
										fullLabel: e.rel,
										source: `preview_${e.from}`,
										target: `preview_${e.to}`,
									}
								})),
						});
					}
				}
			} catch { /* ignore */ }
		}, 2000);
		return () => clearInterval(interval);
	}, [graphLoading, regeneratingFile]);

	return (
		<S.Container>
			{regeneratingFile !== null && regeneratingFile === selectedFile && (graphLoading || generationProgress !== null) && (
				<S.GenerationBanner>
					<S.GenerationRow>
						<S.LoadingIcon />
						<S.GenerationText>Generating knowledge graph…</S.GenerationText>
						{generationProgress && (
							<S.GenerationPercent>{generationProgress.percent}%</S.GenerationPercent>
						)}
						{graphLoading && (
							<S.StopButton onClick={handleStop}>Cancel</S.StopButton>
						)}
					</S.GenerationRow>
					<S.GenerationProgressBar $percent={generationProgress?.percent ?? 0} />
				</S.GenerationBanner>
			)}
			{disabled && !graphLoading && (
				<S.GlobalLoadingContainer>
					<S.LoadingIcon />
				</S.GlobalLoadingContainer>
			)}
			<S.ContentRow>
				<S.GraphWrapper>
					<Graph
						ref={graphRef}
						data={displayData}
						activeNodeId={activeNodeId}
						onActiveNodeIdChange={handleActiveNodeIdChange}
						cachedNodeIds={cachedNodeIds}
						loadingNodeId={backgroundLoadingNodeId}
						loadingClusterHubId={clusterLoadingHubId ?? undefined}
						nodeClickCallback={onNodeClickCallback}
						edgeClickCallback={onEdgeClickCallback}
						chatHighlightedNodeIds={chatHighlightedNodeIds}
					selectionHighlightedNodeIds={selectionHighlightedNodeIds}
						onClusterClick={onClusterClickCallback}
						onClusterCollapsed={(communityId) => {
							if (activeClusterRef.current?.communityId === communityId) {
								setClusterExpanded(false);
							}
						}}
						onClusterModeChange={(isActive) => {
							if (!isActive) clearActiveCluster();
						}}
						onBackgroundClick={() => {
						setSummary(null);
						setSummaryLoading(false);
						setChatHighlightedNodeIds(new Set());
						setSelectionHighlightedNodeIds(new Set());
						setActiveChatNodes(null);
						clearHighlight();
						if (!clusterExpandedRef.current) {
							clearActiveCluster();
						}
					}}
						visible={true}
						disabled={disabled}
						filePath={selectedFile}
					/>
					{data.nodes.length === 0 && hasNonTitleContent && !disabled &&
					 regeneratingFile !== selectedFile && !graphLoading && !!selectedFile &&
					 !graphEverExistedRef.current.has(selectedFile) && (
						<S.GenerateButtonOverlay>
							<S.GenerateKGButton onClick={() => commands[0].callback(selectedFile)}>
								Generate Knowledge Graph
							</S.GenerateKGButton>
						</S.GenerateButtonOverlay>
					)}
				</S.GraphWrapper>
				<S.SidePanel style={{ width: sidePanelWidth }}>
					<S.ResizeHandle onMouseDown={handleResizeMouseDown} />
					<S.SideTabBar>
						<S.SideTabButton $active={sideTab === "summary"} onClick={() => setSideTab("summary")}>Summary</S.SideTabButton>
						<S.SideTabButton $active={sideTab === "chat"} onClick={() => setSideTab("chat")}>Chat</S.SideTabButton>
					</S.SideTabBar>
					{sideTab === "summary" && (
						<>
							{activeCluster ? (
								<>
									<S.ClusterPanelTitle>{activeCluster.label}</S.ClusterPanelTitle>
									<S.ClusterPanelMeta>{activeCluster.memberIds.length} nodes in cluster</S.ClusterPanelMeta>
									{clusterSummaryLoading && (
										<S.SummaryLoadingRow>
											<S.LoadingIcon />
											<S.SummaryStopButton onClick={() => { clusterSummaryAbortRef.current?.abort(); setClusterSummaryLoading(false); setClusterLoadingHubId(null); }}>Cancel</S.SummaryStopButton>
										</S.SummaryLoadingRow>
									)}
									{!clusterSummaryLoading && clusterSummary && <S.SummaryText>{clusterSummary}</S.SummaryText>}
									{!clusterSummaryLoading && clusterSummary && (
										<S.ButtonRow>
											<S.CopyButton onClick={handleCopyClusterSummary}>
												{clusterCopied ? <S.CheckIcon /> : <S.CopyIcon />}
											</S.CopyButton>
											<S.RegenerateSummaryButton onClick={handleRegenerateClusterSummary}>
												<S.RegenerateIcon />
											</S.RegenerateSummaryButton>
											<S.TrashButton onClick={handleClearClusterSummary}>
												<S.TrashIcon />
											</S.TrashButton>
										</S.ButtonRow>
									)}
									{!clusterSummaryLoading && !clusterSummary && (
										<S.GetSummaryButton onClick={() => fetchClusterSummary(activeCluster.hubNodeId)}>Get Summary</S.GetSummaryButton>
									)}
									{!clusterExpanded ? (
										<S.ExpandClusterButton onClick={() => {
											const hubId = activeCluster.hubNodeId;
											activeCluster.expand();
											clearActiveCluster();
											setActiveNodeId(hubId);
											const cacheKey = `${selectedFile}::${hubId}`;
											if (nodeSummaryCacheRef.current.has(cacheKey)) {
												setSummary(nodeSummaryCacheRef.current.get(cacheKey) ?? null);
											} else {
												setSummary(null);
											}
											setSummaryLoading(false);
											activeNodePerFileRef.current.set(selectedFile, { nodeId: hubId, summary: null, loading: false });
										}}>
											Expand Cluster
										</S.ExpandClusterButton>
									) : (
										<S.ExpandClusterButton onClick={() => { activeCluster.collapse(); setClusterExpanded(false); }}>
											Re-Cluster
										</S.ExpandClusterButton>
									)}
								</>
							) : (
								<>
									{regeneratingFile !== selectedFile && summaryLoading && (
										<S.SummaryLoadingRow>
											<S.LoadingIcon />
											<S.SummaryStopButton onClick={handleStopSummary}>Cancel</S.SummaryStopButton>
										</S.SummaryLoadingRow>
									)}
									{regeneratingFile !== selectedFile && !summaryLoading && summary && <S.SummaryText>{summary}</S.SummaryText>}
									{regeneratingFile !== selectedFile && !summaryLoading && summary && (
										<S.ButtonRow>
											<S.CopyButton onClick={handleCopySummary}>
												{copied ? <S.CheckIcon /> : <S.CopyIcon />}
											</S.CopyButton>
											{activeNodeId && (
												<S.RegenerateSummaryButton onClick={handleRegenerateSummary}>
													<S.RegenerateIcon />
												</S.RegenerateSummaryButton>
											)}
											<S.TrashButton onClick={handleClearSummary}>
												<S.TrashIcon />
											</S.TrashButton>
										</S.ButtonRow>
									)}
									{regeneratingFile !== selectedFile && !summaryLoading && !summary && !activeNodeId && data.nodes.length > 0 && (
										<S.SummaryPlaceholder>Click a node to see its connections</S.SummaryPlaceholder>
									)}
									{regeneratingFile !== selectedFile && !summaryLoading && !summary && activeNodeId && (
										<S.GetSummaryButton onClick={handleGetSummary}>Get Summary</S.GetSummaryButton>
									)}
								</>
							)}
						</>
					)}
					{sideTab === "chat" && (
						<ChatPanel
							root={root}
							filePath={selectedFile}
							messages={chatMessages}
							setMessages={setChatMessages}
							error={chatError}
							setError={setChatError}
							loading={chatLoading}
							setLoading={setChatLoading}
							onHighlightNodes={(ids) => setChatHighlightedNodeIds(new Set(ids))}
							activeChatNodes={activeChatNodes}
							onActivateChatNodes={handleActivateChatNodes}
							hasGraph={graphEverExistedRef.current.has(selectedFile) && !(regeneratingFile === selectedFile && graphLoading)}
						/>
					)}
				</S.SidePanel>
			</S.ContentRow>
		</S.Container>
	);
};

export default Main;
