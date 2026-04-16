#!/bin/bash
cd /home/yashvoladoddi/Desktop/sobha-chatbot
export PATH="/home/yashvoladoddi/.nvm/versions/node/v24.13.0/bin:$PATH"
LOG="/home/yashvoladoddi/Desktop/sobha-chatbot/data/processed/ocr-cron.log"
echo "=== OCR run started at $(date) ===" >> "$LOG"
npx tsx scripts/ocr-gemini.ts >> "$LOG" 2>&1
echo "=== OCR run finished at $(date) with exit code $? ===" >> "$LOG"
