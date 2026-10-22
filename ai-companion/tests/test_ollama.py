import asyncio
import json
import httpx
import pytest
from app.config import Config, read_dotenv
from app.ollama_client import OllamaClient


def test_local_ollama_payload_health_and_explicit_cleanup():
    async def run():
        calls=[]
        def handler(request):
            calls.append((request.method,request.url.path,json.loads(request.content) if request.content else None))
            if request.url.path=='/api/tags':return httpx.Response(200,json={'models':[{'name':'gemma3:4b'}]})
            if request.url.path=='/api/generate':return httpx.Response(200,json={'done':True})
            return httpx.Response(200,json={'done':True,'message':{'role':'assistant','content':'Enjoy your coffee!'},'total_duration':100,'eval_count':5,'private':'never forwarded'})
        client=OllamaClient(Config(),httpx.MockTransport(handler))
        assert await client.health()==(True,True)
        assert calls==[('GET','/api/tags',None)]
        reply,timings=await client.generate([{'role':'user','content':'Hello'}]);assert reply=='Enjoy your coffee!'
        payload=calls[-1][2];assert payload['keep_alive']==0 and payload['stream'] is False
        assert payload['options']=={'num_ctx':2048,'num_predict':55,'temperature':.5,'repeat_penalty':1.15}
        assert 'private' not in timings
        assert await client.unload();await client.close()
    asyncio.run(run())


def test_real_total_timeout_and_graceful_no_ollama_health():
    async def run():
        async def handler(request):
            await asyncio.sleep(.1)
            return httpx.Response(200,json={})
        client=OllamaClient(Config(total_timeout=.01),httpx.MockTransport(handler))
        with pytest.raises(TimeoutError):await client.generate([])
        await client.close()
        def refused(request):raise httpx.ConnectError('no local Ollama')
        client=OllamaClient(Config(),httpx.MockTransport(refused))
        assert await client.health()==(False,False)
        assert not await client.unload();await client.close()
    asyncio.run(run())

@pytest.mark.parametrize('url',['https://api.example.com','http://192.168.1.5:11434','http://127.0.0.1:11434/secret','http://user:pass@localhost:11434'])
def test_rejects_nonlocal_or_credential_urls(url):
    with pytest.raises(ValueError):Config(ollama_url=url)


def test_literal_dotenv_and_secret_repr(tmp_path):
    p=tmp_path/'.env';p.write_text('COMPANION_PORT=8765\nCOMPANION_TOKEN="$(not executed)"\n')
    assert read_dotenv(p)['COMPANION_TOKEN']=='$(not executed)'
    assert 'a'*32 not in repr(Config(token='a'*32))


def test_seed_is_server_configured_and_optional():
    async def run():
        payloads=[]
        def handler(request):
            payloads.append(json.loads(request.content))
            return httpx.Response(200,json={'done':True,'message':{'role':'assistant','content':'Hello there!'}})
        client=OllamaClient(Config(seed=42),httpx.MockTransport(handler))
        await client.generate([])
        assert payloads[0]['options']['seed']==42
        assert payloads[0]['keep_alive']==0
        await client.close()
    asyncio.run(run())
