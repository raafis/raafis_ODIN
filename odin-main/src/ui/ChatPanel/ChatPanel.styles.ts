import styled from "styled-components";
import { Check, Copy, Loader2, MoveRight, PenLine, RefreshCw, RotateCcw, Share2, User2, X } from "lucide-react";
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
    flex-direction: column;
    color: var(--text-normal);
    align-self: ${props => props.$isUser ? "flex-end" : "flex-start"};
    max-width: ${props => props.$isUser ? "85%" : "100%"};
    gap: var(--size-4-2);
`;

export const ChatMessageRow = styled.div<{ $isUser?: boolean }>`
    display: flex;
    flex-direction: ${props => props.$isUser ? "row-reverse" : "row"};
    align-items: flex-start;
    gap: var(--size-4-2);
`;

export const ChatMessageActions = styled.div<{ $isUser?: boolean }>`
    display: flex;
    flex-direction: row;
    justify-content: ${props => props.$isUser ? "flex-end" : "flex-start"};
    align-items: center;
    gap: var(--size-4-1);
    padding-left: ${props => props.$isUser ? "0" : "calc(var(--size-4-5) + var(--size-4-2))"};
`;

export const ChatIconBlock = styled.div<{ $isUser: boolean; $clickable?: boolean; $hasChatNodes?: boolean }>`
    width: var(--size-4-5);
    height: var(--size-4-5);
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: var(--radius-s);
    background-color: ${props => props.$isUser ? "var(--color-accent-1)" : props.$hasChatNodes ? "#fb923c" : "#2563eb"};
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
    background: rgba(255, 255, 255, 0.08);
    padding: var(--size-4-2);
    border-radius: var(--radius-s);
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

export const ChatCancelButton = styled.button`
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
    &&:hover {
        opacity: 0.85;
    }
`;

export const ChatCancelSquare = styled.div`
    width: 10px;
    height: 10px;
    background: currentColor;
    border-radius: 1px;
`;

export const ChatClearButton = styled.button<{ $disabled?: boolean }>`
    && {
        flex-shrink: 0;
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: ${p => p.$disabled ? "default" : "pointer"};
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: ${p => p.$disabled ? 0.35 : 1};
        transition: opacity 0.15s;
    }
    &&:hover {
        background: ${p => p.$disabled ? "transparent" : "rgba(255, 255, 255, 0.1)"};
        color: ${p => p.$disabled ? "var(--text-muted)" : "var(--text-normal)"};
    }
`;

export const ChatClearIcon = styled(RefreshCw)`
    width: 14px;
    height: 14px;
`;

export const ChatCopyButton = styled.button`
    && {
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-normal);
    }
`;

export const ChatCopyIcon = styled(Copy)`
    width: 14px;
    height: 14px;
`;

export const ChatCopyCheckIcon = styled(Check)`
    width: 14px;
    height: 14px;
`;

export const ChatRegenerateButton = styled.button`
    && {
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-normal);
    }
`;

export const ChatRegenerateIcon = styled(RotateCcw)`
    width: 14px;
    height: 14px;
`;

export const ChatCopiedToast = styled.span`
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    align-self: center;
    white-space: nowrap;
`;

export const ChatPlaceholder = styled.p`
    margin: 0;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
    padding-top: var(--size-4-4);
`;

export const ChatEditButton = styled.button<{ $disabled?: boolean }>`
    && {
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: ${p => p.$disabled ? "default" : "pointer"};
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: ${p => p.$disabled ? 0.35 : 1};
        transition: opacity 0.15s;
    }
    &&:hover {
        background: ${p => p.$disabled ? "transparent" : "rgba(255, 255, 255, 0.1)"};
        color: ${p => p.$disabled ? "var(--text-muted)" : "var(--text-normal)"};
    }
`;

export const ChatEditIcon = styled(PenLine)`
    width: 14px;
    height: 14px;
`;

export const ChatEditTextarea = styled.textarea`
    resize: none;
    border: 1px solid var(--color-accent-1);
    border-radius: var(--radius-s);
    padding: var(--size-4-2);
    font-size: var(--font-ui-small);
    background: var(--color-base-10);
    color: var(--text-normal);
    line-height: 1.4;
    outline: none;
    width: 100%;
    &:focus {
        box-shadow: none;
    }
`;

export const ChatEditActions = styled.div`
    display: flex;
    flex-direction: row;
    gap: var(--size-4-1);
    justify-content: flex-end;
    margin-top: 4px;
`;

export const ChatEditConfirmButton = styled.button`
    && {
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--color-accent-1);
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.1);
    }
`;

export const ChatEditConfirmIcon = styled(Check)`
    width: 14px;
    height: 14px;
`;

export const ChatEditCancelButton = styled.button`
    && {
        padding: 4px;
        border-radius: var(--radius-s);
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    &&:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-normal);
    }
`;

export const ChatEditCancelIcon = styled(X)`
    width: 14px;
    height: 14px;
`;
