import { Check, Copy, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { AnimatedRotate } from "src/shared/animations";
import { styled, keyframes } from "styled-components";

export const Container = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    gap: var(--size-4-4);
`;

export const ContentRow = styled.div`
    display: flex;
    flex-direction: row;
    flex: 1;
    width: 100%;
    min-height: 0;
    border-top: 1px solid var(--background-modifier-border);
`;

export const SidePanel = styled.div`
    width: 220px;
    min-width: 180px;
    flex-shrink: 0;
    border-left: 1px solid var(--background-modifier-border);
    padding: var(--size-4-3);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
`;

export const SummaryText = styled.p`
    margin: 0;
    font-size: var(--font-ui-small);
    line-height: 1.5;
    color: var(--text-normal);
    background: rgba(255, 255, 255, 0.08);
    padding: var(--size-4-2);
    border-radius: var(--radius-s);
    user-select: text;
    cursor: text;
`;

export const SummaryPlaceholder = styled.p`
    margin: 0;
    font-size: var(--font-ui-small);
    line-height: 1.5;
    color: var(--text-muted);
    font-style: italic;
`;

export const RegenerateSummaryButton = styled.button`
    && {
        align-self: flex-end;
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: #ffffff;
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.15);
    }
`;

export const RegenerateIcon = styled(RotateCcw)`
    width: 14px;
    height: 14px;
`;

export const CopyButton = styled.button`
    && {
        align-self: flex-end;
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: #ffffff;
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.15);
    }
`;

export const CopyIcon = styled(Copy)`
    width: 14px;
    height: 14px;
`;

export const CheckIcon = styled(Check)`
    width: 14px;
    height: 14px;
    color: #ffffff;
`;

export const TrashButton = styled.button`
    && {
        align-self: flex-end;
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-error, #e05252);
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(224, 82, 82, 0.15);
    }
`;

export const TrashIcon = styled(Trash2)`
    width: 14px;
    height: 14px;
`;

export const ButtonRow = styled.div`
    display: flex;
    flex-direction: row;
    gap: var(--size-4-1);
    align-self: flex-end;
`;

export const LoadingIcon = styled(Loader2)`
    ${AnimatedRotate};
    width: var(--size-4-8);
    height: var(--size-4-8);
    color: var(--color-accent-1);
`;

export const LoadingContainer = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
`;

export const GlobalLoadingContainer = styled.div`
    width: var(--size-4-12);
    height: var(--size-4-12);
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    top: var(--size-4-3);
    right: var(--size-4-3);
    border-radius: var(--tab-radius);
    background-color: var(--color-base-00);
    border: 1px solid var(--divider-color);
`;

export const GenerationBanner = styled.div`
    width: 100%;
    padding: var(--size-4-2) var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
    background-color: transparent;
    border-radius: var(--radius-s);
    border-bottom: none !important;
`;

export const GenerationRow = styled.div`
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
`;

export const GenerationText = styled.span`
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    flex: 1;
`;

export const GenerationPercent = styled.span`
    font-size: var(--font-ui-small);
    color: var(--color-accent-1);
    font-weight: var(--font-semibold);
`;

export const StopButton = styled.button`
    && {
        padding: 2px 10px;
        border-radius: var(--radius-s);
        border: 1px solid var(--text-error, #e05252);
        background: transparent;
        color: var(--text-error, #e05252);
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        box-shadow: none;
    }
    &&:hover {
        background: var(--text-error, #e05252);
        color: #fff;
    }
`;

interface GenerationProgressBarProps {
    $percent: number;
}

export const GetSummaryButton = styled.button`
    && {
        padding: 4px 10px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
        background: transparent;
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        box-shadow: none;
        align-self: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-normal);
    }
`;

export const CopiedToast = styled.span`
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    align-self: center;
    white-space: nowrap;
`;

export const GenerationProgressBar = styled.div<GenerationProgressBarProps>`
    width: 100%;
    height: 4px;
    background-color: var(--color-base-25);
    border-radius: 2px;
    overflow: hidden;
    &::after {
        content: '';
        display: block;
        height: 100%;
        width: ${props => props.$percent}%;
        background-color: var(--color-accent-1);
        border-radius: 2px;
        transition: width 0.5s ease;
    }
`;

export const GraphWrapper = styled.div`
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
`;

export const GenerateButtonOverlay = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
`;

export const GenerateKGButton = styled.button`
    && {
        pointer-events: auto;
        padding: 10px 24px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
        background: var(--color-base-20);
        color: var(--text-normal);
        font-size: var(--font-ui-medium);
        cursor: pointer;
        box-shadow: none;
    }
    &&:hover {
        background: var(--color-base-30);
        border-color: var(--color-accent-1);
    }
`;