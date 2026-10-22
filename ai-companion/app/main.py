import asyncio
from contextlib import asynccontextmanager
import hmac
import time
from urllib.parse import urlsplit
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .config import Config
from .schemas import ChatRequest, ChatResponse, HealthResponse
from .policy import classify
from .fallback import fallback
from .prompt_builder import messages
from .response_validator import check_response
from .ollama_client import OllamaClient


class BodyLimit:
    """Pure ASGI byte bound without BaseHTTPMiddleware cancellation interference."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        if headers.get(b'content-type', b'').split(b';')[0].strip() != b'application/json':
            return await JSONResponse({'detail': 'Use application/json'}, status_code=415)(scope, receive, send)
        body = bytearray()
        try:
            async with asyncio.timeout(5):
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    chunk = message.get('body', b'')
                    if len(body) + len(chunk) > 8192:
                        return await JSONResponse({'detail': 'Request too large'}, status_code=413)(scope, receive, send)
                    body.extend(chunk)
                    if not message.get('more_body', False):
                        break
        except TimeoutError:
            return await JSONResponse({'detail': 'Request body timeout'}, status_code=408)(scope, receive, send)
        sent = False
        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()
        await self.app(scope, replay, send)


async def await_generation(client, prompt, request):
    """Cancel upstream HTTP work when the downstream connection goes away."""
    async def disconnected():
        while True:
            message = await request.receive()
            if message['type'] == 'http.disconnect':
                return
    generation = asyncio.create_task(client.generate(prompt))
    watcher = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait((generation, watcher), return_when=asyncio.FIRST_COMPLETED)
        if generation in done:
            return await generation
        raise asyncio.CancelledError()
    finally:
        generation.cancel()
        watcher.cancel()
        await asyncio.gather(generation, watcher, return_exceptions=True)


def create_app(config=None, client=None):
    config = config or Config.load()
    client = client or OllamaClient(config)

    @asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            await client.close()

    app = FastAPI(title='Salary Ledger AI Companion', docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]'])
    app.state.active = 0
    app.state.cleanup_required = False

    async def authorize(request: Request):
        origin = request.headers.get('origin')
        if origin:
            try:
                parsed = urlsplit(origin)
            except ValueError:
                raise HTTPException(403, 'Cross-origin access is disabled') from None
            if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
                    or parsed.netloc != request.headers.get('host')):
                raise HTTPException(403, 'Cross-origin access is disabled')
        if config.token and not hmac.compare_digest(request.headers.get('authorization', '').encode(), ('Bearer ' + config.token).encode()):
            raise HTTPException(401, 'Valid bearer token required', headers={'WWW-Authenticate': 'Bearer'})

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        return JSONResponse(status_code=422, content={'detail': [
            {'loc': e['loc'], 'type': e['type'], 'msg': e['msg']} for e in exc.errors()]})

    app.add_middleware(BodyLimit)

    @app.get('/health', response_model=HealthResponse, dependencies=[Depends(authorize)])
    async def health():
        reachable, available = await client.health()
        return HealthResponse(status='ok' if reachable and available and not app.state.cleanup_required else 'degraded',
                              ollamaReachable=reachable, model=config.model, modelAvailable=available,
                              cleanupRequired=app.state.cleanup_required)

    @app.post('/v1/chat', response_model=ChatResponse, dependencies=[Depends(authorize)])
    async def chat(payload: ChatRequest, request: Request):
        start = time.perf_counter()
        decision = classify(payload.message, payload.tone)
        reply = fallback(payload, decision)
        validation_reason = None
        source, reason, passed, timings = 'fallback', decision.reason or 'unavailable', None, None
        if decision.reason is None:
            if app.state.active >= config.max_in_flight:
                raise HTTPException(429, 'Generation busy; try again later', headers={'Retry-After': '1'})
            if app.state.cleanup_required:
                reason = 'cleanup_required'
            else:
                app.state.active += 1
                completed = False
                try:
                    raw, timings = await await_generation(client, messages(payload, decision), request)
                    completed = True
                    checked = check_response(raw, payload.message)
                    validation_reason = checked.reason
                    passed = checked.reply is not None
                    if passed:
                        reply, source, reason = checked.reply, 'gemma', 'generated'
                    else:
                        reason = 'invalid_output'
                except (TimeoutError, asyncio.TimeoutError):
                    reason = 'timeout'
                except asyncio.CancelledError:
                    raise
                except Exception:
                    reason = 'unavailable'
                finally:
                    try:
                        if not completed:
                            # Do not admit another generation after uncertain upstream cleanup.
                            app.state.cleanup_required = True
                            try:
                                cleaned = await asyncio.shield(client.unload())
                                app.state.cleanup_required = not cleaned
                            except (Exception, asyncio.CancelledError):
                                pass
                    finally:
                        app.state.active -= 1
        return ChatResponse(reply=reply, personality=payload.personality, chaosLevel=payload.chaosLevel,
                            requestedTone=payload.tone, tone=decision.tone, source=source,
                            model=config.model if source == 'gemma' else None,
                            durationMs=round((time.perf_counter()-start)*1000), reason=reason,
                            validationPassed=passed, validationReason=validation_reason, modelTimings=timings)
    return app
