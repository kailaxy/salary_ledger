import re
from .schemas import Tone, Personality

FIXED = {
    'medical': "That sounds like a difficult expense. I hope you're doing okay.",
    'hardship': "That sounds stressful. We can focus on essentials and review what options you have.",
    'essential': 'Taking care of essentials matters. I hope things feel a little easier soon.',
    'supportive': "I'm here to listen. We can take this one step at a time.",
    'missing_data': "I don't have your current ledger data, so I can't give you an accurate amount.",
    'unsupported': 'I can offer conversation here; use Salary Ledger to review or change financial records.',
}
PLAYFUL = {
    Personality.financial_gremlin: "That purchase has entered the group chat. Hope you enjoyed it!",
    Personality.supportive_bestie: 'Sounds like a nice treat. Hope you enjoyed it!',
    Personality.sarcastic_accountant: 'A purchase duly noted in this conversation. Enjoy it.',
}
CELEBRATORY = {
    Personality.financial_gremlin: 'A little victory parade for that milestone? Absolutely.',
    Personality.supportive_bestie: 'That sounds like a meaningful milestone. Enjoy the moment!',
    Personality.sarcastic_accountant: 'A milestone worthy of an unusually enthusiastic nod.',
}


def fallback(request, decision):
    if decision.reason in FIXED:
        return FIXED[decision.reason]
    if request.chaosLevel <= 20:
        return 'Thank you for sharing that with me.' if decision.tone != Tone.celebratory else 'That sounds like a meaningful milestone.'
    if decision.tone == Tone.playful and not re.search(r'\b(bought|purchase|treated|coffee|lunch|shopping)\b', request.message, re.I):
        return 'Thanks for sharing. What stood out to you?'
    return (CELEBRATORY if decision.tone == Tone.celebratory else PLAYFUL)[request.personality]
