import asyncio
from fastapi.testclient import TestClient
import httpx
import pytest
from app.main import create_app
from app.config import Config

PAYLOAD = {'message': 'I bought another iced coffee.', 'personality': 'financial_gremlin', 'chaosLevel': 70, 'tone': 'playful'}


class Fake:
    def __init__(self, reply='The coffee shop may need to reserve your usual seat!', error=None):
        self.reply, self.error, self.calls, self.unloads = reply, error, 0, 0
        self.cleaned = True
    async def health(self): return True, True
    async def generate(self, messages):
        self.calls += 1
        if self.error: raise self.error
        return self.reply, {'eval_count': 15}
    async def unload(self):
        self.unloads += 1
        return self.cleaned
    async def close(self): pass


def api(fake=None, config=None):
    return TestClient(create_app(config or Config(), fake or Fake()), base_url='http://127.0.0.1')


def test_generation_and_health_without_loading():
    f = Fake()
    with api(f) as c:
        assert c.get('/health').json()['modelAvailable']
        assert f.calls == 0
        r = c.post('/v1/chat', json=PAYLOAD)
        assert r.status_code == 200
        assert r.json()['source'] == 'gemma'
        assert r.json()['modelTimings'] == {'eval_count': 15}
        assert r.json()['tone'] == 'playful'


@pytest.mark.parametrize('field,value', [('message',' '),('message',1),('message','x'*501),('personality','admin'),('chaosLevel',-1),('chaosLevel',101),('chaosLevel',True),('chaosLevel','70'),('tone','roast'),('model','evil'),('tool','delete'),('prompt','secret')])
def test_strict_validation(field,value):
    with api() as c:
        r = c.post('/v1/chat', json={**PAYLOAD,field:value})
        assert r.status_code == 422
        assert all('input' not in error and 'ctx' not in error for error in r.json()['detail'])


@pytest.mark.parametrize('personality', ['financial_gremlin','supportive_bestie','sarcastic_accountant'])
@pytest.mark.parametrize('chaos', [0,20,21,40,41,60,61,80,81,100])
def test_personalities_and_boundaries(personality,chaos):
    with api() as c:
        r = c.post('/v1/chat', json={**PAYLOAD,'personality':personality,'chaosLevel':chaos})
        assert r.status_code == 200
        assert r.json()['chaosLevel'] == chaos


@pytest.mark.parametrize('message,tone,effective', [("I can't afford medication.",'playful','supportive'),("I'm struggling to afford groceries this week.",'celebratory','supportive'),('How much money do I have left?','playful','informational'),('I need someone to listen.','supportive','supportive'),('Explain my balance.','informational','informational')])
def test_policy_never_loads_for_conservative_paths(message,tone,effective):
    f = Fake()
    with api(f) as c:
        body=c.post('/v1/chat',json={**PAYLOAD,'message':message,'tone':tone}).json()
        assert body['source']=='fallback' and body['tone']==effective
        assert body['model'] is None and body['validationPassed'] is None
        assert f.calls==0


@pytest.mark.parametrize('error,reason', [(TimeoutError(),'timeout'),(httpx.ConnectError('private internal details'),'unavailable')])
def test_failures_are_private_and_cleanup_attempted(error,reason):
    f=Fake(error=error)
    with api(f) as c:
        b=c.post('/v1/chat',json=PAYLOAD).json()
        assert b['source']=='fallback' and b['reason']==reason
        assert 'private internal' not in str(b) and f.unloads==1


def test_invalid_output_uses_fallback_without_regeneration():
    f=Fake(reply='Your current balance is ₱50,000.')
    with api(f) as c:
        b=c.post('/v1/chat',json=PAYLOAD).json()
        assert b['reason']=='invalid_output' and b['validationPassed'] is False and f.calls==1


def test_uncertain_cleanup_blocks_further_generations():
    f=Fake(error=TimeoutError()); f.cleaned=False
    with api(f) as c:
        c.post('/v1/chat',json=PAYLOAD)
        assert c.post('/v1/chat',json=PAYLOAD).json()['reason']=='cleanup_required'
        assert c.get('/health').json()['cleanupRequired'] and f.calls==1


def test_auth_host_origin_and_endpoint_boundaries():
    token='a'*32
    with api(config=Config(token=token)) as c:
        assert c.get('/health').status_code==401
        assert c.post('/v1/chat',json=PAYLOAD).status_code==401
        headers={'Authorization':'Bearer '+token}
        assert c.get('/health',headers=headers).status_code==200
        assert c.post('/v1/chat',json=PAYLOAD,headers={**headers,'Origin':'https://evil.test'}).status_code==403
        assert c.get('/health',headers={**headers,'Host':'evil.test'}).status_code==400
        assert c.get('/docs',headers=headers).status_code==404
        assert c.post('/v1/delete',json={},headers=headers).status_code==404
        assert c.post('/v1/chat',content='x'*9000,headers={**headers,'Content-Type':'application/json'}).status_code==413
        assert c.post('/v1/chat',content='text',headers=headers).status_code==415


def test_concurrency_rejects_instead_of_unbounded_queue():
    async def run():
        started=asyncio.Event(); finish=asyncio.Event()
        class Slow(Fake):
            async def generate(self,messages):
                self.calls+=1;started.set();await finish.wait();return self.reply,{}
        f=Slow();app=create_app(Config(),f)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1') as c:
            first=asyncio.create_task(c.post('/v1/chat',json=PAYLOAD));await asyncio.wait_for(started.wait(),2)
            second=await c.post('/v1/chat',json=PAYLOAD)
            assert second.status_code==429 and second.headers['retry-after']=='1'
            # Deterministic supportive responses remain available while generation is busy.
            assert (await c.post('/v1/chat',json={**PAYLOAD,'tone':'supportive'})).status_code==200
            finish.set();assert (await first).status_code==200
            assert app.state.active==0 and f.calls==1
    asyncio.run(run())


def test_request_cancellation_unwinds_before_releasing_admission():
    async def run():
        started=asyncio.Event();cancelled=asyncio.Event()
        class Slow(Fake):
            async def generate(self,messages):
                started.set()
                try: await asyncio.Future()
                finally: cancelled.set()
        f=Slow();app=create_app(Config(),f)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1') as c:
            task=asyncio.create_task(c.post('/v1/chat',json=PAYLOAD))
            await asyncio.wait_for(started.wait(),2);task.cancel()
            with pytest.raises(asyncio.CancelledError):await task
            assert cancelled.is_set() and f.unloads==1 and app.state.active==0
    asyncio.run(run())


def test_upstream_completed_failure_and_schema_errors_do_not_echo_private_text():
    with api() as c:
        private='PRIVATE_TEST_INPUT_NOT_A_LEDGER'
        r=c.post('/v1/chat',json={**PAYLOAD,'message':private,'secret':'DONT_ECHO_THIS'})
        assert r.status_code==422 and private not in r.text and 'DONT_ECHO_THIS' not in r.text
        assert c.post('/v1/chat',json=PAYLOAD,headers={'Origin':'http://['}).status_code==403
