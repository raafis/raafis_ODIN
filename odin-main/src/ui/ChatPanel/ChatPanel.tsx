import React, { useEffect, useRef, useState } from "react";
import * as S from "./ChatPanel.styles";
import { fetchData } from "src/util/fetchData";

export type ChatEntry = {
    role: "user" | "ai";
    content: string;
    nodeIds?: string[];
    chatNodes?: Array<{ name: string; nodeType: string; relatedTo: string; relationship: string }>;
};

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
    activeChatNodes?: Array<{ name: string; nodeType: string; relatedTo: string; relationship: string }> | null;
    onActivateChatNodes?: (nodes: Array<{ name: string; nodeType: string; relatedTo: string; relationship: string }> | null) => void;
    hasGraph?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ root, filePath, messages, setMessages, error, setError, loading, setLoading, onHighlightNodes, activeChatNodes, onActivateChatNodes, hasGraph = false }) => {
    const [input, setInput] = useState("");
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleEditStart = (index: number, content: string) => {
        if (loading) return;
        setEditingIndex(index);
        setEditingContent(content);
    };

    const handleEditCancel = () => {
        setEditingIndex(null);
        setEditingContent("");
    };

    const handleEditConfirm = async () => {
        const val = editingContent.trim();
        if (!val || loading || editingIndex === null) return;
        const priorMessages = messages.slice(0, editingIndex);
        setEditingIndex(null);
        setEditingContent("");
        setMessages([...priorMessages, { role: "user", content: val }]);
        onHighlightNodes?.([]);
        onActivateChatNodes?.(null);
        setLoading(true);
        setError("");
        abortControllerRef.current?.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        try {
            const fullFilePath = filePath ? `${root}/${filePath}` : undefined;
            const chatContext = priorMessages
                .filter(m => m.role === "ai")
                .flatMap(m => m.chatNodes?.map(cn => cn.name) ?? []);
            const data = await fetchData(
                "http://localhost:8000/knowledge_base/general/ask",
                { repo: { path: root, type: "Notes" }, prompt: val, type: "Notes", file_path: fullFilePath, chat_context: chatContext },
                undefined,
                300000,
                ac.signal
            );
            const content = data?.content?.trim();
            if (content) {
                const ids: string[] = (data.node_ids ?? []).map(String);
                const chatNodes = (data.chat_nodes ?? []).map((cn: any) => ({
                    name: cn.name, nodeType: cn.node_type, relatedTo: cn.related_to, relationship: cn.relationship,
                }));
                setMessages(prev => [...prev, {
                    role: "ai",
                    content,
                    nodeIds: ids.length > 0 ? ids : undefined,
                    chatNodes: chatNodes.length > 0 ? chatNodes : undefined,
                }]);
                if (ids.length > 0) onHighlightNodes?.(ids);
                if (chatNodes.length > 0) onActivateChatNodes?.(chatNodes);
            } else {
                setError("No response received. Check that Ollama is running and a knowledge graph has been generated for this vault.");
            }
        } catch (e: any) {
            if (e?.code !== 'ERR_CANCELED' && e?.name !== 'CanceledError') {
                setError(e.message || "Request failed");
            }
        } finally {
            abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const handleRegenerate = async (index: number) => {
        if (loading) return;
        const question = messages[index - 1]?.content;
        if (!question) return;
        const savedAiMessage = messages[index];
        const trimmed = messages.slice(0, index);
        setMessages(trimmed);
        onHighlightNodes?.([]);
        onActivateChatNodes?.(null);
        setLoading(true);
        setError("");
        abortControllerRef.current?.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        try {
            const fullFilePath = filePath ? `${root}/${filePath}` : undefined;
            const chatContext = trimmed
                .filter(m => m.role === "ai")
                .flatMap(m => m.chatNodes?.map(cn => cn.name) ?? []);
            const data = await fetchData(
                "http://localhost:8000/knowledge_base/general/ask",
                { repo: { path: root, type: "Notes" }, prompt: question, type: "Notes", file_path: fullFilePath, chat_context: chatContext },
                undefined,
                300000,
                ac.signal
            );
            const content = data?.content?.trim();
            if (content) {
                const ids: string[] = (data.node_ids ?? []).map(String);
                const chatNodes = (data.chat_nodes ?? []).map((cn: any) => ({
                    name: cn.name, nodeType: cn.node_type, relatedTo: cn.related_to, relationship: cn.relationship,
                }));
                setMessages(prev => [...prev, {
                    role: "ai",
                    content,
                    nodeIds: ids.length > 0 ? ids : undefined,
                    chatNodes: chatNodes.length > 0 ? chatNodes : undefined,
                }]);
                if (ids.length > 0) onHighlightNodes?.(ids);
                if (chatNodes.length > 0) onActivateChatNodes?.(chatNodes);
            } else {
                setError("No response received. Check that Ollama is running and a knowledge graph has been generated for this vault.");
            }
        } catch (e: any) {
            if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') {
                setMessages(prev => [...prev, savedAiMessage]);
            } else {
                setError(e.message || "Request failed");
            }
        } finally {
            abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const handleCancel = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setLoading(false);
    };

    const handleClear = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setLoading(false);
        setMessages([]);
        setError("");
        setInput("");
        onHighlightNodes?.([]);
        onActivateChatNodes?.(null);
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const submit = async () => {
        const val = input.trim();
        if (!val || loading) return;
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: val }]);
        setLoading(true);
        setError("");
        abortControllerRef.current?.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        try {
            const fullFilePath = filePath ? `${root}/${filePath}` : undefined;
            const chatContext = messages
                .filter(m => m.role === "ai")
                .flatMap(m => m.chatNodes?.map(cn => cn.name) ?? []);
            const data = await fetchData(
                "http://localhost:8000/knowledge_base/general/ask",
                { repo: { path: root, type: "Notes" }, prompt: val, type: "Notes", file_path: fullFilePath, chat_context: chatContext },
                undefined,
                300000,
                ac.signal
            );
            const content = data?.content?.trim();
            if (content) {
                const ids: string[] = (data.node_ids ?? []).map(String);
                const chatNodes = (data.chat_nodes ?? []).map((cn: any) => ({
                    name: cn.name, nodeType: cn.node_type, relatedTo: cn.related_to, relationship: cn.relationship,
                }));
                setMessages(prev => [...prev, {
                    role: "ai",
                    content,
                    nodeIds: ids.length > 0 ? ids : undefined,
                    chatNodes: chatNodes.length > 0 ? chatNodes : undefined,
                }]);
                if (ids.length > 0) onHighlightNodes?.(ids);
                if (chatNodes.length > 0) onActivateChatNodes?.(chatNodes);
            } else {
                setError("No response received. Check that Ollama is running and a knowledge graph has been generated for this vault.");
            }
        } catch (e: any) {
            if (e?.code !== 'ERR_CANCELED' && e?.name !== 'CanceledError') {
                setError(e.message || "Request failed");
            }
        } finally {
            abortControllerRef.current = null;
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
                    const isUser = msg.role === "user";
                    const hasNodes = !isUser && (!!msg.nodeIds?.length || !!msg.chatNodes?.length);
                    return (
                        <S.ChatMessage key={i} $isUser={isUser}>
                            <S.ChatMessageRow $isUser={isUser}>
                                {!isUser && (
                                    <S.ChatIconBlock
                                        $isUser={isUser}
                                        $clickable={hasNodes}
                                        $hasChatNodes={!!msg.chatNodes?.length}
                                        onClick={hasNodes ? () => {
                                            if (msg.nodeIds?.length) onHighlightNodes?.(msg.nodeIds);
                                            if (msg.chatNodes?.length) {
                                                onActivateChatNodes?.(activeChatNodes === msg.chatNodes ? null : msg.chatNodes);
                                            } else {
                                                onActivateChatNodes?.(null);
                                            }
                                        } : undefined}
                                    >
                                        <S.ChatAIIcon />
                                    </S.ChatIconBlock>
                                )}
                                {isUser && editingIndex === i ? (
                                    <>
                                        <S.ChatEditTextarea
                                            value={editingContent}
                                            onChange={e => setEditingContent(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditConfirm(); }
                                                if (e.key === "Escape") handleEditCancel();
                                            }}
                                            autoFocus
                                            rows={2}
                                        />
                                        <S.ChatEditActions>
                                            <S.ChatEditConfirmButton onClick={handleEditConfirm} title="Confirm edit">
                                                <S.ChatEditConfirmIcon />
                                            </S.ChatEditConfirmButton>
                                            <S.ChatEditCancelButton onClick={handleEditCancel} title="Cancel edit">
                                                <S.ChatEditCancelIcon />
                                            </S.ChatEditCancelButton>
                                        </S.ChatEditActions>
                                    </>
                                ) : (
                                    <S.ChatText>{msg.content}</S.ChatText>
                                )}
                            </S.ChatMessageRow>
                            <S.ChatMessageActions $isUser={isUser}>
                                <S.ChatCopyButton onClick={() => handleCopy(msg.content, i)} title="Copy">
                                    {copiedIndex === i ? <S.ChatCopyCheckIcon /> : <S.ChatCopyIcon />}
                                </S.ChatCopyButton>
                                {isUser && editingIndex !== i && (
                                    <S.ChatEditButton
                                        onClick={!loading ? () => handleEditStart(i, msg.content) : undefined}
                                        title="Edit"
                                        $disabled={loading}
                                    >
                                        <S.ChatEditIcon />
                                    </S.ChatEditButton>
                                )}
                                {!isUser && i === messages.length - 1 && (
                                    <S.ChatRegenerateButton onClick={() => handleRegenerate(i)} title="Regenerate">
                                        <S.ChatRegenerateIcon />
                                    </S.ChatRegenerateButton>
                                )}
                            </S.ChatMessageActions>
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
                <S.ChatClearButton
                    onClick={messages.length > 0 ? handleClear : undefined}
                    title="Restart conversation"
                    $disabled={messages.length === 0}
                >
                    <S.ChatClearIcon />
                </S.ChatClearButton>
                <S.ChatInput
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your notes..."
                    disabled={loading}
                    rows={2}
                />
                {loading
                    ? <S.ChatCancelButton onClick={handleCancel}><S.ChatCancelSquare /></S.ChatCancelButton>
                    : <S.ChatSendButton onClick={submit} disabled={!input.trim()}>
                          <S.ChatSendIcon />
                      </S.ChatSendButton>
                }
            </S.ChatInputRow>
        </S.ChatContainer>
    );
};

export default ChatPanel;
