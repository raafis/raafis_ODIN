import styled from "styled-components";
import cytoscape from "cytoscape";
import theme from "src/shared/theme";

interface GraphContainerProps {
    $visible: boolean;
}

const priorityColors = {
    1: theme.colors["secondary-neutral"],
    2: theme.colors["accent-light"],
    3: theme.colors["accent"]
}

type priorityColorsKey = keyof typeof priorityColors;

export const GraphContainer = styled.div<GraphContainerProps>`
    width: 100%;
    height: 100%;
    border: none !important;
    visibility: ${props => props.$visible ? "visible" : "hidden"};
`;

export const GraphStyle = [
    {
        selector: "node",
        style: {
            label: "data(label)",
            color: theme.colors.secondary,
            width: (node: cytoscape.NodeSingular) =>
                (node.data("priority") * 10 + 10) + "px",
            height: (node: cytoscape.NodeSingular) =>
                (node.data("priority") * 10 + 10) + "px",
            "background-color": (node: cytoscape.NodeSingular) =>
                priorityColors[node.data("priority") as priorityColorsKey],
            "font-size": "16px",
            "text-wrap": "wrap",
            "text-max-width": "100px",
            "text-outline-color": theme.colors.primary,
            "text-outline-width": "2px",
        },
    },
    {
        selector: "node.has-summary",
        style: {
            "background-color": "#4ade80",
        },
    },
    {
        selector: "node.loading-background",
        style: {
            "border-width": "3px",
            "border-color": "#15803d",
        },
    },
    {
        selector: "node.chat-node",
        style: {
            "background-color": "#fb923c",
            "border-width": "2px",
            "border-color": "#ea580c",
            width: "20px",
            height: "20px",
        },
    },
    {
        selector: "edge",
        style: {
            width: 1,
            label: "data(label)",
            color: "white",
            "line-color": (edge: cytoscape.EdgeSingular) =>
                priorityColors[edge.target().data('priority') as priorityColorsKey],
            "target-arrow-color": theme.colors["secondary-neutral"],
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "control-point-step-size": 60,
            "edge-text-rotation": "autorotate",
            "font-size": "10px",
            "min-zoomed-font-size": 7,
            "text-wrap": "wrap",
            "text-max-width": "80px",
            "text-outline-color": theme.colors.primary,
            "text-outline-width": "2px",
        },
    },
    {
        selector: "edge.chat-node-edge",
        style: {
            "line-color": "#fb923c",
            "target-arrow-color": "#fb923c",
            width: 2,
            "z-index": 5,
        },
    },
    {
        selector: "node:selected",
        style: {
            "background-color": theme.colors["accent"],
            "border-width": "2px",
            "border-color": theme.colors["secondary-neutral"],
            label: "data(fullLabel)",
            "text-wrap": "wrap",
            "text-max-width": "150px",
        },
    },
    {
        selector: "edge:selected",
        style: {
            width: 3,
            "line-color": theme.colors["accent-light"],
            "target-arrow-color": theme.colors["accent-light"],
            label: "data(fullLabel)",
            "text-wrap": "wrap",
            "text-max-width": "150px",
        },
    },
    {
        selector: "node.hovered",
        style: {
            width: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            height: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            "border-width": "3px",
            "border-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "node.chat-node.hovered",
        style: {
            width: "23px",
            height: "23px",
        },
    },
    {
        selector: "node.hover-neighbor-outgoing, node.active-neighbor-outgoing",
        style: {
            "border-width": "3px",
            "border-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "node.hover-neighbor-incoming, node.active-neighbor-incoming",
        style: {
            "border-width": "3px",
            "border-color": "white",
        },
    },
    {
        selector: "edge.hovered",
        style: {
            width: 3,
            "line-color": theme.colors["accent-light"],
            "target-arrow-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "edge.hovered-incoming",
        style: {
            width: 3,
            "line-color": "white",
            "target-arrow-color": "white",
        },
    },
    {
        selector: "edge.edge-active",
        style: {
            width: 3,
            label: "data(fullLabel)",
            "font-size": "10px",
            "text-max-width": "150px",
            "min-zoomed-font-size": 7,
            "line-color": theme.colors["accent-light"],
            "target-arrow-color": theme.colors["accent-light"],
            "z-index": 15,
        },
    },
    {
        selector: "edge.edge-active-incoming",
        style: {
            width: 3,
            label: "data(fullLabel)",
            "font-size": "10px",
            "text-max-width": "150px",
            "min-zoomed-font-size": 7,
            "line-color": "white",
            "target-arrow-color": "white",
            "z-index": 15,
        },
    },
    {
        selector: ".dimmed",
        style: {
            opacity: 0.25,
        },
    },
    {
        selector: "node.active-neighbor-outgoing.hovered",
        style: {
            width: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            height: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            "border-width": "5px",
            "border-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "node.active-neighbor-incoming.hovered",
        style: {
            width: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            height: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            "border-width": "5px",
            "border-color": "white",
        },
    },
    {
        selector: "node:selected.hovered",
        style: {
            width: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
            height: (node: cytoscape.NodeSingular) => (node.data("priority") * 10 + 13) + "px",
        },
    },
    {
        selector: "node.chat-highlighted",
        style: {
            "background-color": "#3b82f6",
            "border-width": "3px",
            "border-color": "#2563eb",
            "border-opacity": 1,
        },
    },
    {
        selector: "node.chat-highlighted.dimmed",
        style: {
            opacity: 0.7,
        },
    },
    {
        selector: "edge.chat-highlighted",
        style: {
            width: 2,
            "line-color": "#2563eb",
            "target-arrow-color": "#2563eb",
            "z-index": 10,
        },
    },
    {
        selector: "edge.chat-highlighted.chat-front",
        style: {
            "z-index": 20,
        },
    },
    {
        selector: "edge.chat-highlighted.dimmed",
        style: {
            opacity: 0.7,
        },
    },
    {
        selector: "node.chat-highlighted.hovered",
        style: {
            "border-width": "3px",
            "border-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "node.chat-highlighted.hover-neighbor-outgoing, node.chat-highlighted.active-neighbor-outgoing",
        style: {
            "border-width": "3px",
            "border-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "node.chat-highlighted.hover-neighbor-incoming, node.chat-highlighted.active-neighbor-incoming",
        style: {
            "border-width": "3px",
            "border-color": "white",
        },
    },
    {
        selector: "edge.chat-highlighted.hovered",
        style: {
            width: 3,
            "line-color": theme.colors["accent-light"],
            "target-arrow-color": theme.colors["accent-light"],
        },
    },
    {
        selector: "edge.chat-highlighted.hovered-incoming",
        style: {
            width: 3,
            "line-color": "white",
            "target-arrow-color": "white",
        },
    },
    {
        selector: "edge.chat-highlighted.edge-active",
        style: {
            width: 3,
            label: "data(fullLabel)",
            "font-size": "10px",
            "text-max-width": "150px",
            "min-zoomed-font-size": 7,
            "line-color": theme.colors["accent-light"],
            "target-arrow-color": theme.colors["accent-light"],
            "z-index": 15,
        },
    },
    {
        selector: "edge.chat-highlighted.edge-active-incoming",
        style: {
            width: 3,
            label: "data(fullLabel)",
            "font-size": "10px",
            "text-max-width": "150px",
            "min-zoomed-font-size": 7,
            "line-color": "white",
            "target-arrow-color": "white",
            "z-index": 15,
        },
    },
]