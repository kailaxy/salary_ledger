#!/usr/bin/env python3
"""Operator-only local cleanup; run when no other application is using this model."""
import asyncio
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Config
from app.ollama_client import OllamaClient

async def main():
    client=OllamaClient(Config.load())
    try:
        ok=await client.unload()
        print('Unload acknowledged. Check ollama ps; restart the companion if cleanupRequired was set.' if ok else 'Unload not confirmed. Check Ollama locally and ollama ps before restarting the companion.')
        return 0 if ok else 1
    finally:
        await client.close()

if __name__=='__main__':
    raise SystemExit(asyncio.run(main()))
