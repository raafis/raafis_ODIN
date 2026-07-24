import styled from "styled-components";
import cytoscape from "cytoscape";
import theme from "src/shared/theme";
import { Layers } from "lucide-react";

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

export const GraphOuter = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
`;

export const ClusterToggleButton = styled.button<{ $active: boolean }>`
    && {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: var(--radius-s);
        border: 1px solid ${p => p.$active ? "var(--color-accent-1)" : "var(--background-modifier-border)"};
        background: ${p => p.$active ? "var(--color-accent-1)" : "var(--color-base-20)"};
        color: ${p => p.$active ? "var(--color-base-90)" : "var(--text-muted)"};
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        z-index: 10;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    &&:hover {
        border-color: var(--color-accent-1);
        color: ${p => p.$active ? "var(--color-base-90)" : "var(--text-normal)"};
    }
`;

export const ClusterIcon = styled(Layers)`
    width: 14px;
    height: 14px;
`;

export const CollapseAllButton = styled.button`
    && {
        position: absolute;
        top: 8px;
        right: 44px;
        height: 28px;
        padding: 0 10px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
        background: var(--color-base-20);
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        box-shadow: none;
        z-index: 10;
        transition: border-color 0.15s, color 0.15s;
    }
    &&:hover {
        border-color: var(--color-accent-1);
        color: var(--text-normal);
    }
`;

export const ClusterMenuDropdown = styled.div`
    position: absolute;
    top: 44px;
    right: 8px;
    z-index: 20;
    background: var(--color-base-20);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    min-width: 200px;
    max-width: 280px;
    padding: 4px 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
`;

export const ClusterMenuLabel = styled.div`
    padding: 4px 10px 2px;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
`;

export const ClusterMenuRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px 3px 14px;
    gap: var(--size-4-2);
    &:hover {
        background: var(--color-base-30);
    }
`;

export const ClusterMenuRowLabel = styled.span`
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    &:hover {
        color: var(--text-accent);
    }
`;

export const ClusterMenuReClusterBtn = styled.button`
    && {
        padding: 1px 6px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
        background: transparent;
        color: var(--text-muted);
        font-size: 10px;
        cursor: pointer;
        box-shadow: none;
        flex-shrink: 0;
        white-space: nowrap;
    }
    &&:hover {
        border-color: var(--color-accent-1);
        color: var(--color-accent-1);
    }
`;

export const ClusterMenuSeparator = styled.div`
    height: 1px;
    background: var(--background-modifier-border);
    margin: 4px 0;
`;

export const ClusterMenuActionBtn = styled.button`
    && {
        width: 100%;
        padding: 4px 10px;
        background: transparent;
        border: none;
        box-shadow: none;
        color: var(--text-muted);
        font-size: var(--font-ui-small);
        cursor: pointer;
        text-align: left;
        display: block;
    }
    &&:hover {
        background: var(--color-base-30);
        color: var(--text-normal);
    }
`;

export const GraphStyle: any[] = [
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
    {
        selector: 'node[id^="preview_"]',
        style: {
            opacity: 0.45,
        },
    },
    {
        selector: 'edge[id^="preview_e_"]',
        style: {
            "line-color": "#646464",
            "target-arrow-color": "#646464",
            "color": "#838383",
            "text-outline-color": "#1E1E1E",
        },
    },
    {
        selector: "node.cluster-node",
        style: {
            shape: "round-rectangle",
            width: (node: cytoscape.NodeSingular) => Math.max(70, 50 + (node.data("memberCount") as number || 1) * 2) + "px",
            height: "46px",
            "background-color": theme.colors["secondary-neutral"],
            "background-opacity": 0.85,
            "border-width": "2px",
            "border-color": theme.colors["secondary-neutral"],
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "130px",
            "font-size": "13px",
            color: theme.colors.secondary,
            "text-outline-color": theme.colors.primary,
            "text-outline-width": "2px",
            "z-compound-depth": "auto",
        },
    },
    {
        selector: "node.cluster-node.hovered",
        style: {
            "border-color": theme.colors["accent-light"],
            "border-width": "3px",
            "background-opacity": 1,
        },
    },
    {
        selector: "node.cluster-node.cluster-selected",
        style: {
            "background-color": theme.colors["accent"],
            "background-opacity": 1,
            "border-width": "2px",
            "border-color": theme.colors["accent"],
        },
    },
    {
        selector: "node.cluster-node.chat-highlighted",
        style: {
            "background-color": "#3b82f6",
            "background-opacity": 1,
            "border-width": "3px",
            "border-color": "#2563eb",
            "border-opacity": 1,
        },
    },
    {
        selector: "node.cluster-node.has-summary",
        style: {
            "background-color": "#4ade80",
            "background-opacity": 0.85,
        },
    },
    {
        selector: "node.cluster-node.loading-background",
        style: {
            "border-width": "3px",
            "border-color": "#15803d",
        },
    },
    {
        selector: "node.cluster-hover-highlight",
        style: {
            "border-width": "3px",
            "border-color": "#f59e0b",
            opacity: 1,
        },
    },
    {
        selector: 'edge[id^="cluster_e_"]',
        style: {
            "line-style": "dashed",
            "line-color": theme.colors["secondary-neutral"],
            "target-arrow-color": theme.colors["secondary-neutral"],
            "line-dash-pattern": [6, 4],
            opacity: 0.55,
            label: "",
            width: 1.5,
        },
    },
    {
        selector: "edge.proxy-cluster-edge",
        style: {
            "line-style": "dashed",
            "line-color": theme.colors["secondary-neutral"],
            "target-arrow-color": theme.colors["secondary-neutral"],
            "line-dash-pattern": [6, 4],
            opacity: 0.55,
            label: "",
            width: 1.5,
        },
    },
]