import React, { useEffect, useRef, useState } from "react";
import * as S from "./ChatPanel.styles";
import { fetchData } from "src/util/fetchData";

export type ChatEntry = { content: string; nodeIds?: string[] };

interface ChatPanelProps {
    root: string;
    filePath: string;
    messages: ChatEntry[];
    setMessages: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
    error: string;
    setError: React.Dispatch<React.SetStateAction<string>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    onHighlightNodes?: (nodeIds: string[]) => void;
    hasGraph?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ root, filePath, messages, setMessages, error, setError, loading, setLoading, onHighlightNodes, hasGraph = false }) => {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const submit = async () => {
        const val = input.trim();
        if (!val || loading) return;
        setInput("");
        setMessages(prev => [...prev, { content: val }]);
        setLoading(true);
        setError("");
        try {
            const fullFilePath = filePath ? `${root}/${filePath}` : undefined;
            const data = await fetchData(
                "http://localhost:8000/knowledge_base/general/ask",
                { repo: { path: root, type: "Notes" }, prompt: val, type: "Notes", file_path: fullFilePath }
            );
            const content = data?.content?.trim();
            if (content) {
                const ids: string[] = (data.node_ids ?? []).map(String);
                setMessages(prev => [...prev, { content, nodeIds: ids.length > 0 ? ids : undefined }]);
                if (ids.length > 0) onHighlightNodes?.(ids);
            } else {
                setError("No response received. Check that Ollama is running and a knowledge graph has been generated for this vault.");
            }
        } catch (e: any) {
            setError(e.message || "Request failed");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    if (!hasGraph) return <S.ChatContainer />;

    return (
        <S.ChatContainer>
            <S.ChatMessages>
                {messages.length === 0 && !loading && (
                    <S.ChatPlaceholder>Ask a question about your notes</S.ChatPlaceholder>
                )}
                {messages.map((msg, i) => {
                    const isUser = i % 2 === 0;
                    const hasNodes = !isUser && !!msg.nodeIds?.length;
                    return (
                        <S.ChatMessage key={i} $isUser={isUser}>
                            <S.ChatIconBlock
                                $isUser={isUser}
                                $clickable={hasNodes}
                                onClick={hasNodes ? () => onHighlightNodes?.(msg.nodeIds!) : undefined}
                            >
                                {isUser ? <S.ChatUserIcon /> : <S.ChatAIIcon />}
                            </S.ChatIconBlock>
                            <S.ChatText>{msg.content}</S.ChatText>
                        </S.ChatMessage>
                    );
                })}
                {loading && (
                    <S.ChatLoadingRow>
                        <S.ChatLoadingIcon />
                        <span>Thinking...</span>
                    </S.ChatLoadingRow>
                )}
                {error && <S.ChatError>{error}</S.ChatError>}
                <div ref={messagesEndRef} />
            </S.ChatMessages>
            <S.ChatInputRow>
                <S.ChatInput
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your notes..."
                    disabled={loading}
                    rows={2}
                />
                <S.ChatSendButton onClick={submit} disabled={loading || !input.trim()}>
                    <S.ChatSendIcon />
                </S.ChatSendButton>
            </S.ChatInputRow>
        </S.ChatContainer>
    );
};

export default ChatPanel;
