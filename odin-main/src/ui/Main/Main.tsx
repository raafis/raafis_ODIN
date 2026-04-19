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
import { NodeSingular } from "cytoscape";
import { AnalyticsNode } from "src/model/AnalyticsNode";
import { Selection } from "src/shared/types/Selection";
import { Sentence } from "src/model/Sentence";
import getFilenameFromPath from "src/util/getFilenameFromPath";

const Main: React.FC = (): React.JSX.Element => {
	const app = useApp();
	const [data, setData] = useState<{ nodes: Node[]; edges: Edge[] }>({
		nodes: [],
		edges: [],
	});
	const [suggested, setSuggested] = useState<number[]>([]);
	const [selectedFile, setSelectedFile] = useState<string>(
		app?.workspace.activeEditor?.file?.path || ""
	);
	const [graphLoading, setGraphLoading] = useState<boolean>(false);
	const [firstRender, setFirstRender] = useState<boolean>(true);
	const [disabled, setDisabled] = useState<boolean>(true);
	const disabledRef = useRef<boolean>(true);

	const root =
		app?.vault.adapter instanceof FileSystemAdapter
			? app.vault.adapter.getBasePath().replaceAll("\\", "/")
			: "/";

	const onNodeClickCallback = async (node: NodeSingular) => {
		let ignoreResults = false;
		{
			setDisabled(true);
			const active = selectedFile;
			if (suggested.length > 0) setSuggested([]);
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

	const predictLinks = async (file: string) => {
		if (!app?.workspace.activeEditor?.editor?.getSelection()) {
			new Notice(Messages.noSelectedText);
			return;
		}

		let ignoreResults = false;
		const active = selectedFile;
		setDisabled(true);
		const fetchBody = {
			repo: {
				path: root,
				type: "Notes",
			},
			content: app?.workspace.activeEditor?.editor?.getSelection() || "",
		};
		console.log(fetchBody);
		await fetchData(
			"http://localhost:8000/knowledge_base/notes/suggest_link",
			fetchBody
		)
			.then((data) => {
				const pos = getEditorPosition(
					app.workspace.activeEditor?.editor?.getValue() || "",
					app.workspace.activeEditor?.editor?.getSelection().trim() ||
						""
				).head;
				pos.ch++;

				if (pos && active === selectedFile && !ignoreResults)
					app.workspace.activeEditor?.editor?.replaceRange(
						`[[${getFilenameFromPath(data.path).split(".")[0]}]] `,
						pos,
						pos
					);
			})
			.catch(() => {
				new Notice(Messages.fetchFailed);
			});
		setDisabled(false);

		return () => {
			ignoreResults = true;
		};
	};

	const nodeSuggest = async (text: string) => {
		console.log("disabled:");
		console.log(disabledRef.current);
		if (disabledRef.current) {
			new Notice(Messages.loadingText);
			return;
		}

		if (text.length === 0) {
			new Notice(Messages.noSelectedText);
			return;
		}

		setDisabled(true);
		const fetchBody = {
			repo: {
				path: root,
				type: "Notes",
			},
			content: text,
		};

		await fetchData(
			"http://localhost:8000/knowledge_base/notes/sentence_to_nodes",
			fetchBody
		)
			.then((data) => {
				console.log("fetched nodes data: ");
				console.log(data);
				setSuggested(data.map((node: AnalyticsNode) => node.id));
				populateGraphData(false);
			})
			.catch(() => {
				new Notice(Messages.fetchFailed);
			});
		setDisabled(false);
	};

	const commands = [
		{
			title: "Link prediction",
			icon: "file-symlink",
			callback: predictLinks,
			data: "path",
		},
		{
			title: "Node suggestion",
			icon: "hexagon",
			callback: nodeSuggest,
			data: "selection",
		},
		{
			title: "Regenerate Knowledge Graph",
			icon: "git-pull-request-arrow",
			callback: async (filePath: string) => {
				if (!filePath) {
					new Notice("No file is open.");
					return;
				}
				try {
					await fetchData(
						"http://localhost:8000/knowledge_base/notes/delete_file",
						{ path: root + "/" + filePath, type: "Notes", content: "" },
						"DELETE"
					);
					setSelectedFile("");
					setTimeout(() => setSelectedFile(filePath), 100);
				} catch {
					new Notice("Failed to regenerate knowledge graph.");
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

		await fetchGraphData(root, selectedFile, ignoreResults, suggested)
			.then(async (data) => {
				if (data.nodes.length === 0 && type === "file" && selectedFile) {
					setGraphLoading(true);
					new Notice("Generating knowledge graph…");
					await fetchData(
						"http://localhost:8000/knowledge_base/notes/add_file",
						{ path: root + "/" + selectedFile, type: "Notes", content: "" },
						"PUT",
						300000
					).catch(() => {});
					const newData = await fetchGraphData(root, selectedFile, ignoreResults, suggested)
						.catch(() => ({ nodes: [], edges: [] }));
					setData(newData);
				} else {
					setData(data);
				}
			})
			.catch(() => {
				new Notice(Messages.fetchFailed);
			});

		setGraphLoading(false);
		console.log("repopulated");
		setDisabled(false);
		console.log(disabled || selectedFile.length === 0);

		return () => {
			ignoreResults = true;
		};
	};

	useEffect(() => {
		disabledRef.current = disabled;
	}, [disabled]);

	useEffect(() => {
		if (!firstRender) populateGraphData(false);
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
			setSelectedFile(app.workspace.activeEditor?.file?.path || "");
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

		populateGraphData(true);
		setDisabled(false);
		setFirstRender(false);

		return () => {
			eventRefs.forEach((ref) => app?.workspace.offref(ref));
		};
	}, []);

	return (
		<S.Container>
			{disabled && !graphLoading && (
				<S.GlobalLoadingContainer>
					<S.LoadingIcon />
				</S.GlobalLoadingContainer>
			)}
			<Graph
				data={data}
				nodeClickCallback={onNodeClickCallback}
				visible={!graphLoading}
				disabled={disabled}
			/>
			{graphLoading && (
				<S.LoadingContainer>
					<S.LoadingIcon />
				</S.LoadingContainer>
			)}
		</S.Container>
	);
};

export default Main;
