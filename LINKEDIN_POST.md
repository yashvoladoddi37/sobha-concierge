My apartment has 172 pages of official documents — bylaws, meeting minutes, penalty schedules. Nobody reads them.

So I built an AI concierge that does.

Ask it anything about the apartment and it pulls the exact clause, page number, and citation from the source documents.

Under the hood: hybrid search (vectors + BM25), Cohere reranking, two-tier query routing, and a Gemini Vision OCR pipeline that turned scanned PDFs into searchable text.

The entire stack runs on free-tier APIs. $0/month.

Try it: https://sobha-chatbot.vercel.app/

#AI #RAG #BuildInPublic
