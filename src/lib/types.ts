import type { UIMessage } from "ai";

export interface SourceChunk {
  docName: string;
  docType: string;
  chapter: string | null;
  section: string | null;
  pageNumber: number | null;
  docDate: string | null;
  content: string;
}

export interface ChatMessageMetadata {
  sources?: SourceChunk[];
}

export type SobhaMessage = UIMessage<ChatMessageMetadata>;
