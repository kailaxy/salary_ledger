import asyncio
import httpx
import pytest
from app.config import Config
from app.main import create_app
from app.ollama_client import OllamaClient, Generation
from app.response_validator import check_response
from fastapi.testclient import TestClient
from test_api import PAYLOAD


@pytest.mark.parametrize('ending', ['☕', '💀', '✨', '🛍️', '👍🏽', '👩‍💻', '❤️', '!”', '!"', '!)', '!*'])
def test_legacy_completion_accepts_symbol_and_closing_quote_endings(ending):
    assert check_response('A little plot twist for the day' + ending, 'A parcel arrived.').reply


@pytest.mark.parametrize('text', ['A little victory for the day', 'Enjoy that coffee ☕', 'A little win!”'])
def test_explicit_stop_needs_no_terminal_punctuation(text):
    assert check_response(text, 'I bought coffee.', completion_reason='stop').reply==text


@pytest.mark.parametrize('text', ['A complete-looking sentence!', 'Enjoy your coffee ☕', 'This is a fragment'])
def test_output_limit_always_rejected_even_with_valid_punctuation(text):
    result=check_response(text,'I bought coffee.',completion_reason='length')
    assert result.reply is None and result.reason=='incomplete_output'


def test_missing_or_unknown_completion_stays_conservative():
    for completion in [None, 'unexpected']:
        assert check_response('This ends in an unfinished','Hello.',completion_reason=completion).reason=='incomplete_output'


@pytest.mark.parametrize('text', [
    'Well, that’s just...sad. Want to hear about my day?',
    "That's just sad. Want to chat?",
    "You're just sad.",
    'That is just…sad.',
])
def test_observed_dismissiveness_and_close_variants_rejected(text):
    assert check_response(text,"I'm bored.",completion_reason='stop').reason=='dismissive_text'


@pytest.mark.parametrize('text', [
    'That’s a seriously sweet ride—completely free now! 🎉',
    'Freedom on two wheels, officially yours! 🎉',
    'You own it outright!',
    'A clean title, finally!',
    'Free and clear at last!',
])
def test_loan_payoff_does_not_establish_ownership(text):
    assert check_response(text,'I finished paying off my motorcycle loan.',completion_reason='stop').reason=='grounding'


@pytest.mark.parametrize('text,message', [
    ('That sounds sad. Want to talk?', 'I had a difficult day.'),
    ('Your last loan is paid off? A milestone worth celebrating!', 'I paid off my last loan!'),
    ('That motorcycle loan is paid off. Nicely done!', 'I paid off my motorcycle loan!'),
    ('A little less to juggle!', 'I have two loans, but I paid off one.'),
])
def test_support_and_narrow_achievement_still_allowed(text,message):
    assert check_response(text,message,completion_reason='stop').reply==text


@pytest.mark.parametrize('completion,expected', [('stop','gemma'), ('length','fallback'), (None,'gemma')])
def test_upstream_metadata_reaches_api_and_preserves_timings(completion,expected):
    calls=[]
    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200,json={'done':True,'done_reason':completion,
             'message':{'role':'assistant','content':'A plot twist for the day ☕'},'eval_count':12})
    client=OllamaClient(Config(),httpx.MockTransport(handler))
    with TestClient(create_app(Config(),client),base_url='http://127.0.0.1') as api:
        body=api.post('/v1/chat',json=PAYLOAD).json()
        assert body['source']==expected
        assert body['modelTimings']=={'eval_count':12}
        if completion=='length':
            assert body['reason']=='invalid_output'
            assert body['validationReason']=='incomplete_output'
        else:
            assert body['validationReason'] is None
        # A completed upstream length stop already requests keep_alive:0;
        # it is not a transport failure needing an extra unload or retry.
        assert calls==['/api/chat']


def test_generation_preserves_two_value_unpacking():
    result=Generation('Hello!', {'eval_count':2}, 'stop')
    reply,timings=result
    assert reply=='Hello!' and timings=={'eval_count':2}


@pytest.mark.parametrize('text,reason', [
    ('Twenty-five bucks well spent!', 'monetary_claim'),
    ('I just saved your transaction.', 'action_claim'),
    ('Three coffees for you!', 'grounding'),
])
def test_normal_stop_never_bypasses_content_checks(text,reason):
    assert check_response(text,'I bought 2 coffees.',completion_reason='stop').reason==reason
