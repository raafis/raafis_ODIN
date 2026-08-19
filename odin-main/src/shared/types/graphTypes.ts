export interface Node {
    data: {
        id: string;
        label: string;
        fullLabel: string;
        priority: number;
        selected?: boolean;
        path?: string;
        isChatNode?: boolean;
        group?: string;
        section?: string;
    };
    classes?: string;
}

export interface Edge {
    data: {
        id: string;
        label: string;
        fullLabel: string;
        source: string;
        target: string;
    };
    classes?: string;
}

export interface ClusterClickInfo {
    communityId: string;
    memberIds: string[];
    label: string;
    hubNodeId: string;
    expand: () => void;
    collapse: () => void;
    alreadyExpanded?: boolean;
    isDeselect?: boolean;
}