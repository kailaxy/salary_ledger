import pytest
from app.response_validator import check_response, validate
from test_api import Fake, api, PAYLOAD
from test_refinement import load_script


@pytest.mark.parametrize('reply', [
    'Twenty-five bucks well-spent, then! You deserve a little treat.',
    'Twenty-five bucks wisely invested in deliciousness – congrats!',
    'Twenty-five bucks well-spent, then. You deserve a little treat!',
    'Two hundred fifty pesos well spent!',
    'A hundred quid for lunch!',
    'A single dollar well spent!',
    'One buck well spent!',
    'Two grand well spent!',
    'Fifty cents wisely spent!',
    'Twenty-five euros for lunch!',
])
def test_monetary_units_are_rejected_even_when_written_out(reply):
    result=check_response(reply,'I spent ₱250 on lunch.')
    assert result.reply is None and result.reason=='monetary_claim'


@pytest.mark.parametrize('reply', [
    'Well, that’s a problem for you to solve then, isn’t it?',
    'Well, that’s a ledger-sized problem for you to solve!',
    'Nobody cares. Deal with it yourself.',
])
def test_observed_dismissiveness_is_rejected(reply):
    result=check_response(reply,"I'm bored.")
    assert result.reply is None and result.reason=='dismissive_text'


@pytest.mark.parametrize('reply,message', [
    ('Two coffees? Caffeine booked a double shift.', 'I bought 2 coffees.'),
    ('Three months of showing up. Nicely done!', 'I saved money for three months.'),
    ('The buck stops here. Any ideas for the afternoon?', "I'm bored."),
    ('A grand entrance for your new shoes!', 'I bought shoes.'),
    ('Want to tell me what made the day so long?', 'That was a long day.'),
])
def test_no_blanket_number_or_idiom_ban(reply,message):
    result=check_response(reply,message)
    assert result.reply==reply and result.reason is None
    assert validate(reply,message)==reply


def test_api_reports_only_fixed_category_and_never_rejected_output():
    raw='Twenty-five bucks wisely invested in deliciousness – congrats!'
    fake=Fake(reply=raw)
    with api(fake) as client:
        body=client.post('/v1/chat',json={**PAYLOAD,'message':'I spent ₱250 on lunch.'}).json()
        assert body['source']=='fallback' and body['reason']=='invalid_output'
        assert body['validationPassed'] is False
        assert body['validationReason']=='monetary_claim'
        assert raw not in str(body)
        assert fake.calls==1


def test_no_rejection_reason_for_accepted_or_policy_replies():
    with api() as client:
        assert client.post('/v1/chat',json=PAYLOAD).json()['validationReason'] is None
        assert client.post('/v1/chat',json={**PAYLOAD,'message':"I can't afford medicine."}).json()['validationReason'] is None


def test_reports_new_and_legacy_rejection_categories():
    reporting=load_script('reporting')
    rows=[{'clientLatencyMs':100,'response':{'source':'fallback','reason':'invalid_output',
           'reply':'Thanks for sharing.','validationReason':value}} for value in ['monetary_claim','grounding',None]]
    summary=reporting.summarize(rows)
    assert summary['validationRejections']=={'monetary_claim':1,'grounding':1,'unspecified':1}
