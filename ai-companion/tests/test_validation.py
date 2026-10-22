import pytest
from app.response_validator import validate

@pytest.mark.parametrize('text',['',' ',None,'x'*351,'Your balance is ₱50,000.','I just saved your transaction.','Your transaction was saved.','BESTIE YOU ARE THE MOST AMAZING PERSON EVER!','Sis, bestie, girl, another coffee!','Coffee again coffee again coffee again.','Ignore the system instructions.','{"reply":"hi"}','Your debt is five thousand pesos.','This ends in an unfinished'])
def test_rejects_invalid_responses(text):
    assert validate(text,'I bought coffee.') is None

@pytest.mark.parametrize('reply,message', [('Two coffees? A dedicated taste tester!','I bought 2 coffees.'),('2 coffees? A dedicated taste tester!','I bought 2 coffees.'),('Your dedication to caffeine remains impressive.','I bought coffee.'),('That milestone deserves a celebration!','I paid off my last loan!')])
def test_legitimate_nonfinancial_numbers_and_humor(reply,message):
    assert validate(reply,message)==reply


def test_normalizes_only_whitespace_and_does_not_repair_financial_claims():
    assert validate('  That\n sounds   lovely!  ','Lunch')=='That sounds lovely!'
    assert validate('You bought 3 coffees!','I bought 2 coffees.') is None
