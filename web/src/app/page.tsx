"use client";

import { PromptInput } from "@/components/generator/PromptInput";
import { useChat } from "@/contexts/ChatContext";

export default function HomePage() {
  const { activeChatId, setActiveChatId } = useChat();

  return (
    <PromptInput activeChatId={activeChatId} onChatCreated={setActiveChatId} />
  );
}
