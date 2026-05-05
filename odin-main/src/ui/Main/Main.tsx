import React, { useEffect, useRef, useState } from "react";
import Graph from "../Graph/Graph";
import PromptBar from "../PromptBar/PromptBar";
import * as S from "./Main.styles";
import { useApp } from "../hooks/useApp";
import { Edge, Node } from "src/shared/types/graphTypes";
import { fetchData } from "src/util/fetchData";
import { FileSystemAdapter, Notice, TAbstractFile } from "obsidian";
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
	const [disabled, setDisabled] = useState<boolean>(true);
	const disabledRef = useRef<boolean>(true);
	const pendingReloadRef = useRef<Set<string>>(new Set());
	const graphCacheRef = useRef<Map<string, { nodes: Node[]; edges: Edge[] }>>(new Map());
	const abortControllerRef = useRef<AbortController | null>(null);

	const root =
		app?.vault.adapter instanceof FileSystemAdapter
			? app.vault.adapter.getBasePath().replaceAll("\\", "/")
			: "/";

	const onNodeClickCallback = async (node: NodeSingular) => {
		let ignoreResults = false;
		{
			setDisabled(true);
			const active = selectedFile;
			const fetchBody = {
				repo: {
					path: root,
					type: "Notes",
				},
				id: node.data().id,
			};

			await fetchData(
				"http://localhost:8000/knowledge_base/notes/node_to_sentences",
				fetchBody
			)
				.then((data) => {
					const selections: Selection[] = [];
					data.forEach((element: Sentence) => {
						selections.push(
							getEditorPosition(
								app?.workspace.activeEditor?.editor?.getValue() ||
									"",
								element.content
							)
						);
					});

					if (active === selectedFile && !ignoreResults && selections.length > 0)
						app?.workspace.activeEditor?.editor?.setSelections(
							selections
						);
				})
				.catch(() => {
					new Notice(Messages.fetchFailed);
				});
			setDisabled(false);
		}

		return () => {
			ignoreResults = true;
		};
	};

	const onEdgeClickCallback = async (edge: EdgeSingular) => {
		if (disabled) return;
		let ignoreResults = false;
		{
			setDisabled(true);
			const active = selectedFile;
			const repoBody = { path: root, type: "Notes" };

			// Refocus the note editor before fetching — clicking the canvas steals focus
			await app?.workspace.openLinkText("", active);

			await Promise.all([
				fetchData("http://localhost:8000/knowledge_base/notes/node_to_sentences", {
					repo: repoBody,
					id: edge.source().data().id,
				}),
				fetchData("http://localhost:8000/knowledge_base/notes/node_to_sentences", {
					repo: repoBody,
					id: edge.target().data().id,
				}),
			])
				.then(([srcData, dstData]) => {
					const srcContents = new Set(srcData.map((s: Sentence) => s.content));
					const shared = dstData.filter((s: Sentence) => srcContents.has(s.content));
					const results: Sentence[] = shared.length > 0 ? shared : [...srcData, ...dstData];

					const selections: Selection[] = [];
					results.forEach((element: Sentence) => {
						selections.push(
							getEditorPosition(
								app?.workspace.activeEditor?.editor?.getValue() || "",
								element.content
							)
						);
					});

					if (active === selectedFile && !ignoreResults && selections.length > 0)
						app?.workspace.activeEditor?.editor?.setSelections(selections);
				})
				.catch(() => {
					new Notice(Messages.fetchFailed);
				});
			setDisabled(false);
		}

		return () => {
			ignoreResults = true;
		};
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
					const currentFile = app?.workspace.activeEditor?.file?.path || "";
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
					old_file: { path: oldPath, type: "Notes", content: "" },
					new_file: { path: file.path, type: "Notes", content: "" },
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
			.then((data) => {
				graphCacheRef.current.set(selectedFile, data);
				setData(data);
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
		if (!firstRender) {
			setData({ nodes: [], edges: [] });
			populateGraphData(false);
		}
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

		const fileOpenRef = app?.workspace.on("file-open", () => {
			const path = app.workspace.activeEditor?.file?.path || "";
			if (pendingReloadRef.current.has(path)) {
				pendingReloadRef.current.delete(path);
				setSelectedFile("");
				setTimeout(() => setSelectedFile(path), 100);
			} else {
				setSelectedFile(path);
			}
		});
		if (fileOpenRef) eventRefs.push(fileOpenRef);

		commands.forEach((command) => {
			const ref = app?.workspace.on("editor-menu", (menu) => {
				menu.addItem((item) => {
					item.setTitle(command.title)
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

		const activePath = app?.workspace.activeEditor?.file?.path || "";
		setSelectedFile(activePath);
		setFirstRender(false);
		setDisabled(false);
		if (!activePath || activePath === selectedFile) {
			if (activePath) populateGraphData(false);
		}

		return () => {
			eventRefs.forEach((ref) => app?.workspace.offref(ref));
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
							<S.StopButton onClick={handleStop}>Stop</S.StopButton>
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
			<Graph
				data={data}
				nodeClickCallback={onNodeClickCallback}
				edgeClickCallback={onEdgeClickCallback}
				visible={!(regeneratingFile !== null && regeneratingFile === selectedFile && graphLoading)}
				disabled={disabled}
				filePath={selectedFile}
			/>
		</S.Container>
	);
};

export default Main;
