export interface Node {
    data: {
        id: string;
        label: string;
        fullLabel: string;
        priority: number;
        selected?: boolean;
        path?: string;
    };
}

export interface Edge {
    data: {
        id: string;
        label: string;
        fullLabel: string;
        source: string;
        target: string;
    };
}