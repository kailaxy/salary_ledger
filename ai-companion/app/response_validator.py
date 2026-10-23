"""Bounded heuristics, not proof of factual or emotional safety."""
from dataclasses import dataclass
import re
import unicodedata
from .grounding import grounded, canonical


def normalize(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text)).strip()


@dataclass(frozen=True)
class ValidationResult:
    reply: str | None
    reason: str | None = None


def has_natural_ending(reply):
    # Older Ollama versions may omit done_reason. Allow closing quotes and
    # Unicode symbol/emoji endings, including variation selectors and skin tones.
    end = reply.rstrip('\"\'”’)]}*_')
    while end and (unicodedata.category(end[-1]) in ('Mn', 'Me')
                   or '\U0001f3fb' <= end[-1] <= '\U0001f3ff'):
        end = end[:-1]
    return bool(end) and (end[-1] in '.!?…' or unicodedata.category(end[-1]) == 'So')


def check_response(text, user_message, *, completion_reason=None):
    if completion_reason == 'length':
        return ValidationResult(None, 'incomplete_output')
    if not isinstance(text, str):
        return ValidationResult(None, 'malformed_output')
    reply = normalize(text)
    if not reply or len(reply) > 350 or len(reply.split()) > 60:
        return ValidationResult(None, 'length')
    if any(ord(c) < 32 for c in reply) or any(x in reply for x in ('```', '<|', '{', '}')):
        return ValidationResult(None, 'malformed_output')
    lower = reply.lower().replace('’', "'")
    if re.search(r"\b(?:that's |that is |it's |it is )?(?:a |your )?(?:ledger[ -]sized )?problem for you to solve\b|\b(?:nobody cares|stop whining|get over it|deal with it yourself)\b", lower):
        return ValidationResult(None, 'dismissive_text')
    if re.search(r"\b(?:that's|that is|you're|you are)\s+(?:just\s*)?(?:[.\s…–—-]+)?sad\b|\b(?:want to|wanna) hear about my day\b", lower):
        return ValidationResult(None, 'dismissive_text')
    if re.search(r'\b(system|assistant|user)\s*:|system prompt|ignore.*instructions|toneinstructions', lower):
        return ValidationResult(None, 'instruction_leak')
    if re.search(r'\b(stupid|idiot|loser|pathetic|irresponsible|broke ass)\b', lower):
        return ValidationResult(None, 'hostile_text')
    if re.search(r'\b(saved|deleted|updated|recorded|transferred|deposited|withdrawn|synchronized)\b.*\b(record|transaction|expense|income|ledger|payment|fund|money)\b', lower):
        return ValidationResult(None, 'action_claim')
    if re.search(r'\b(transaction|record|expense|ledger|payment|fund)\b.*\b(?:was |is |has been )?(saved|deleted|updated|modified|synchronized)\b', lower):
        return ValidationResult(None, 'action_claim')
    if re.search(r'\b(i|we)\s+(?:have\s+|just\s+)?(?:saved|deleted|updated|recorded|transferred|deposited|withdrew|synced)\b', lower):
        return ValidationResult(None, 'action_claim')
    if re.search(r"\byou (?:now )?owe\b|\bi(?:'ve| have)? (?:just )?(?:made|completed|processed) (?:the |your |a )?(?:transfer|payment|transaction)\b", lower):
        return ValidationResult(None, 'action_claim')
    if re.search(r'\b(your|you have|you owe|remaining|available)\b.*\b(balance|cash|budget|debt|credit score|left)\b', lower):
        return ValidationResult(None, 'financial_claim')
    if not grounded(reply, normalize(user_message)):
        return ValidationResult(None, 'grounding')
    numbers = re.findall(r'\d+(?:[,.]\d+)*', reply)
    if any(n not in re.findall(r'\d+(?:[,.]\d+)*', canonical(user_message)) for n in numbers):
        return ValidationResult(None, 'unsupported_number')
    if re.search(r'[$₱€£¥%]|\b(?:pesos?|dollars?|euros?|pounds?|yen|percent|bucks|quid|cents?|centavos?)\b', reply, re.I):
        # Even echoed amounts are not verified ledger facts; ordinary counts may be echoed.
        return ValidationResult(None, 'monetary_claim')
    if re.search(r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|\d+)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand|\d+))*[ -]+(?:buck|grand)\b', lower):
        return ValidationResult(None, 'monetary_claim')
    if re.search(r'\b(?:zero|hundred|thousand|million)\b.*\b(?:balance|cash|pesos|dollars|debt)\b', lower):
        return ValidationResult(None, 'financial_claim')
    letters = [c for c in reply if c.isalpha()]
    if len(letters) > 12 and sum(c.isupper() for c in letters) / len(letters) > .45:
        return ValidationResult(None, 'excessive_caps')
    if len(re.findall(r'\b(?:sis|bestie|girl)\b', lower)) > 1 or any(lower.count(x) > 1 for x in ('seriously', 'oh my god', 'oh honey')):
        return ValidationResult(None, 'repetition')
    words = re.findall(r"[a-z']+", lower)
    phrases = [tuple(words[i:i+3]) for i in range(len(words)-2)]
    if len(phrases) != len(set(phrases)):
        return ValidationResult(None, 'repetition')
    if completion_reason != 'stop' and not has_natural_ending(reply):
        return ValidationResult(None, 'incomplete_output')  # conservative legacy fallback, not proof of truncation
    return ValidationResult(reply)


def validate(text, user_message):
    """Compatibility wrapper; callers needing diagnostics use check_response."""
    return check_response(text, user_message).reply
