export interface Node {
    data: {
        id: string;
        label: string;
        fullLabel: string;
        priority: number;
        selected?: boolean;
        path?: string;
        isChatNode?: boolean;
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