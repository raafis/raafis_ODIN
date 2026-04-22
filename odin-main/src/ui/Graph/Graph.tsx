import React, { useEffect, useRef, useState } from "react";
import cytoscape, { NodeSingular } from "cytoscape";
import { GraphContainer, GraphStyle } from "./Graph.styles";
import { Node, Edge } from "../../shared/types/graphTypes";
import { LAYOUT } from "../../shared/constants";
import { useApp } from "../hooks/useApp";

interface GraphProps {
	data: {
		nodes: Node[];
		edges: Edge[];
	};
	nodeClickCallback?: (node: NodeSingular) => void;
	visible: boolean;
	disabled: boolean;
}

const Graph: React.FC<GraphProps> = ({
	data,
	nodeClickCallback,
	visible,
	disabled,
}) => {
	const [selected, setSelected] = useState<string | undefined>(undefined);
	const [activeNodeId, setActiveNodeId] = useState<string | undefined>(undefined);
	const activeNodeIdRef = useRef<string | undefined>(undefined);
	const cyRef = useRef<cytoscape.Core | null>(null);
	const app = useApp();

	app?.workspace.onLayoutReady(() => {
		app.workspace.on("resize", () => {
			if (cyRef.current) {
				cyRef.current.layout({ name: LAYOUT }).run();
			}
		});
	});

	const registerFileOpenHandler = () => {
		app?.workspace.on("file-open", () => {
			setSelected(app.workspace.activeEditor?.file?.path.split(/(\\|\/)/g).pop());
			setActiveNodeId(undefined);
		});
	};

	const registerNodeClickHandler = () => {
		const handleNodeClick = (event: cytoscape.EventObject) => {
			if (event.target.data().priority === 1) {
				let path = event.target.data().path.split(/(\\|\/)/g).pop();
				setSelected(path);
				app?.workspace.openLinkText("", path);
			}
			setActiveNodeId(event.target.id());
		};
		cyRef.current?.on("click", "node", handleNodeClick);
	};

	const registerHoverHandler = () => {
		cyRef.current?.on("mouseover", "node", (event) => {
			const node = event.target;
			node.addClass("hovered");
			node.outgoers("edge").addClass("hovered");
			const currentActiveId = activeNodeIdRef.current;
			let excluded = node.union(node.outgoers("edge"));
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length) {
					excluded = excluded.union(activeNode).union(activeNode.outgoers("edge"));
				}
			}
			cyRef.current?.elements().not(excluded).addClass("dimmed");
		});
		cyRef.current?.on("mouseout", "node", (event) => {
			const node = event.target;
			node.removeClass("hovered");
			node.outgoers("edge").removeClass("hovered");
			cyRef.current?.elements().removeClass("dimmed");
			const currentActiveId = activeNodeIdRef.current;
			if (currentActiveId) {
				const activeNode = cyRef.current?.$id(currentActiveId);
				if (activeNode?.length) {
					cyRef.current?.elements()
						.not(activeNode)
						.not(activeNode.outgoers("edge"))
						.addClass("dimmed");
				}
			}
		});
		cyRef.current?.on("mouseover", "edge", (event) => {
			event.target.addClass("hovered");
		});
		cyRef.current?.on("mouseout", "edge", (event) => {
			event.target.removeClass("hovered");
		});
	};

	const registerClickHandler = () => {
		const handleClick = (event: cytoscape.EventObject) => {
			if (event.target === cyRef.current) {
				cyRef.current?.edges().deselect();
				setActiveNodeId(undefined);
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
			layout: {
				name: LAYOUT,
				fit: true,
				padding: 150,
				spacingFactor: 150,
			},
			minZoom: 0.3,
			maxZoom: 2,
		});

		registerFileOpenHandler();
		registerNodeClickHandler();
		registerClickHandler();
		registerHoverHandler();

		return () => {
			console.log("destroy");
			cyRef.current?.destroy();
		};
	}, []);

	useEffect(() => {
		console.log("refreshing");
		const refreshGraph = () => {
			if (cyRef.current) {
				cyRef.current.elements().remove();
				cyRef.current.add([...data.nodes, ...data.edges]);
				cyRef.current.layout({ name: LAYOUT }).run();
			}
			cyRef.current?.resize();
		};

		console.log("refresh");
		refreshGraph();
		setActiveNodeId(undefined);
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
			cyRef.current.edges().removeClass("edge-active");
			cyRef.current.elements().removeClass("dimmed");
			if (activeNodeId) {
				const activeNode = cyRef.current.$id(activeNodeId);
				if (activeNode.length) {
					activeNodeIdRef.current = activeNodeId;
					activeNode.outgoers("edge").addClass("edge-active");
					cyRef.current.elements()
						.not(activeNode)
						.not(activeNode.outgoers("edge"))
						.addClass("dimmed");
				}
			} else {
				activeNodeIdRef.current = undefined;
			}
		}
	}, [activeNodeId, data]);

	return <GraphContainer id="cy" $visible={visible} />;
};

export default Graph;
