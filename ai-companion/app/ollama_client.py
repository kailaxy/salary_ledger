import asyncio
import json
import httpx
from .config import Config


class OllamaClient:
    def __init__(self, config: Config, transport=None):
        self.config = config
        self.http = httpx.AsyncClient(base_url=config.ollama_url.rstrip('/'), trust_env=False,
                                      follow_redirects=False, transport=transport,
                                      timeout=httpx.Timeout(config.total_timeout, connect=config.connect_timeout))

    async def close(self):
        await self.http.aclose()

    async def _json(self, method, path, **kwargs):
        # Bound even a misconfigured/malfunctioning local peer's response.
        async with self.http.stream(method, path, **kwargs) as response:
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > 262144:
                    raise ValueError('Ollama response exceeded limit')
                body.extend(chunk)
            return json.loads(body)

    async def health(self):
        try:
            async with asyncio.timeout(self.config.connect_timeout + 1):
                data = await self._json('GET', '/api/tags')
            models = data.get('models', [])
            available = any(m.get('name') == self.config.model or m.get('model') == self.config.model for m in models)
            return True, available
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, TimeoutError):
            return False, False

    async def generate(self, messages):
        c = self.config
        async with asyncio.timeout(c.total_timeout):
            data = await self._json('POST', '/api/chat', json={
                'model': c.model, 'messages': messages, 'stream': False, 'keep_alive': 0,
                'options': {'num_ctx': c.num_ctx, 'num_predict': c.num_predict,
                            'temperature': c.temperature, 'repeat_penalty': c.repeat_penalty,
                            **({'seed': c.seed} if c.seed is not None else {})}})
        if not isinstance(data, dict) or data.get('done') is not True or (data.get('message') or {}).get('role') != 'assistant':
            raise ValueError('Malformed Ollama response')
        if data.get('done_reason') == 'length':
            raise ValueError('Truncated generation')
        reply = data['message'].get('content')
        keys = ('total_duration', 'load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration')
        timings = {k: data[k] for k in keys if type(data.get(k)) is int and data[k] >= 0}
        return reply, timings

    async def unload(self):
        try:
            async with asyncio.timeout(self.config.cleanup_timeout):
                data = await self._json('POST', '/api/generate', json={'model': self.config.model, 'keep_alive': 0})
            return isinstance(data, dict) and data.get('done') is True
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, TimeoutError):
            return False
