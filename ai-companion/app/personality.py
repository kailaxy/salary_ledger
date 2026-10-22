from .schemas import Personality

STYLES = {
    Personality.financial_gremlin: 'Witty online bestie; mild teasing about harmless purchases, occasional sis/bestie, no shaming.',
    Personality.supportive_bestie: 'Warm, encouraging friend; gentle humor, celebrate without lectures or sentimentality.',
    Personality.sarcastic_accountant: 'Dry, understated office humor; accounting observations, never degrading or hostile.',
}
BANDS = (
    (20, 'Straightforward, very little humor.'),
    (40, 'Light personality and subtle humor.'),
    (60, 'Conversational, moderately witty.'),
    (80, 'Playful, occasionally dramatic; no forced catchphrases.'),
    (100, 'Strong but bounded personality; never sacrifice tone or facts for a joke.'),
)


def style(personality, chaos):
    return STYLES[personality] + ' ' + next(text for ceiling, text in BANDS if chaos <= ceiling)
