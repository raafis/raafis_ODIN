import styled from "styled-components";
import { Loader2, MoveRight, Share2, User2 } from "lucide-react";
import { AnimatedRotate } from "src/shared/animations";

export const ChatContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
`;

export const ChatMessages = styled.div`
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
    padding-bottom: var(--size-4-2);
`;

export const ChatMessage = styled.div<{ $isUser: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: var(--size-4-2);
    color: var(--text-normal);
`;

export const ChatIconBlock = styled.div<{ $isUser: boolean; $clickable?: boolean }>`
    width: var(--size-4-5);
    height: var(--size-4-5);
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: var(--radius-s);
    background-color: ${props => props.$isUser ? "var(--color-accent-1)" : "#2563eb"};
    color: var(--color-base-90);
    margin-top: 2px;
    cursor: ${props => props.$clickable ? "pointer" : "default"};
    transition: opacity 0.15s;
    &:hover {
        opacity: ${props => props.$clickable ? 0.8 : 1};
    }
`;

export const ChatUserIcon = styled(User2)`
    width: 12px;
    height: 12px;
`;

export const ChatAIIcon = styled(Share2)`
    width: 12px;
    height: 12px;
`;

export const ChatText = styled.div`
    font-size: var(--font-ui-small);
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
    color: var(--text-normal);
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
`;

export const ChatLoadingRow = styled.div`
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
`;

export const ChatLoadingIcon = styled(Loader2)`
    ${AnimatedRotate};
    width: 14px;
    height: 14px;
    color: var(--color-accent-1);
    flex-shrink: 0;
`;

export const ChatError = styled.div`
    font-size: var(--font-ui-smaller);
    color: var(--text-error, #e05252);
    padding: var(--size-4-2);
    border-radius: var(--radius-s);
    border: 1px solid var(--text-error, #e05252);
    word-break: break-word;
`;

export const ChatInputRow = styled.div`
    display: flex;
    flex-direction: row;
    gap: var(--size-4-1);
    align-items: flex-end;
    flex-shrink: 0;
    padding-top: var(--size-4-2);
    border-top: 1px solid var(--background-modifier-border);
`;

export const ChatInput = styled.textarea`
    flex: 1;
    resize: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: var(--size-4-2);
    font-size: var(--font-ui-small);
    background: var(--color-base-10);
    color: var(--text-normal);
    line-height: 1.4;
    outline: none;

    &:focus {
        border-color: var(--color-accent-1);
        box-shadow: none;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

export const ChatSendButton = styled.button`
    && {
        flex-shrink: 0;
        width: var(--size-4-8);
        height: var(--size-4-8);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-s);
        border: none;
        box-shadow: none;
        background: var(--color-accent-1);
        color: var(--color-base-90);
        cursor: pointer;
        padding: 0;
        transition: opacity 0.15s;
    }
    &&:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    &&:not(:disabled):hover {
        opacity: 0.85;
    }
`;

export const ChatSendIcon = styled(MoveRight)`
    width: 14px;
    height: 14px;
`;

export const ChatPlaceholder = styled.p`
    margin: 0;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
    padding-top: var(--size-4-4);
`;
