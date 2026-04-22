import { Loader2 } from "lucide-react";
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
    background-color: var(--color-base-10);
    border-bottom: 1px solid var(--divider-color);
    border-radius: var(--radius-s);
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

interface GenerationProgressBarProps {
    $percent: number;
}

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