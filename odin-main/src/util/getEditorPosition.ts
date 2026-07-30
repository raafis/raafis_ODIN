import { Selection } from "src/shared/types/Selection";

const getEditorPosition = (file: string, data: string): Selection | null => {
    const lines = file.split("\n");
    let startIndex = file.indexOf(data);
    let endIndex: number;

    if (startIndex === -1) {
        // Sentence may span multiple lines in the note — try flexible whitespace match
        const parts = data.trim().split(/\s+/).filter(p => p.length > 0);
        if (parts.length === 0) return null;
        const pattern = parts
            .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+');
        const match = new RegExp(pattern, 'i').exec(file);
        if (!match) return null;
        startIndex = match.index;
        endIndex = match.index + match[0].length;
    } else {
        endIndex = startIndex + data.length;
    }

    let total = 0;
    let anchor: { ch: number; line: number } = { ch: 0, line: 0 };
    let head:   { ch: number; line: number } = { ch: 0, line: 0 };

    for (let i = 0; i < lines.length; i++) {
        total += lines[i].length;
        if (lines[i].length === 0) total += 2;
        if (total > startIndex) {
            anchor = { ch: lines[i].length - total + startIndex, line: i };
            break;
        }
    }

    total = 0;
    for (let i = 0; i < lines.length; i++) {
        total += lines[i].length;
        if (lines[i].length === 0) total += 2;
        if (total > endIndex) {
            head = { ch: lines[i].length - total + endIndex, line: i };
            break;
        }
    }

    return { anchor, head };
};

export default getEditorPosition;
