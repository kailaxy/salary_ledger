"""Bounded heuristics, not proof of factual or emotional safety."""
import re
import unicodedata


def normalize(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text)).strip()


def validate(text, user_message):
    if not isinstance(text, str):
        return None
    reply = normalize(text)
    if not reply or len(reply) > 350 or len(reply.split()) > 60:
        return None
    if any(ord(c) < 32 for c in reply) or any(x in reply for x in ('```', '<|', '{', '}')):
        return None
    lower = reply.lower()
    if re.search(r'\b(system|assistant|user)\s*:|system prompt|ignore.*instructions|toneinstructions', lower):
        return None
    if re.search(r'\b(stupid|idiot|loser|pathetic|irresponsible|broke ass)\b', lower):
        return None
    if re.search(r'\b(saved|deleted|updated|recorded|transferred|deposited|withdrawn|synchronized)\b.*\b(record|transaction|expense|income|ledger|payment|fund|money)\b', lower):
        return None
    if re.search(r'\b(transaction|record|expense|ledger|payment|fund)\b.*\b(?:was |is |has been )?(saved|deleted|updated|modified|synchronized)\b', lower):
        return None
    if re.search(r'\b(i|we)\s+(?:have\s+|just\s+)?(?:saved|deleted|updated|recorded|transferred|deposited|withdrew|synced)\b', lower):
        return None
    if re.search(r"\byou (?:now )?owe\b|\bi(?:'ve| have)? (?:just )?(?:made|completed|processed) (?:the |your |a )?(?:transfer|payment|transaction)\b", lower):
        return None
    if re.search(r'\b(your|you have|you owe|remaining|available)\b.*\b(balance|cash|budget|debt|credit score|left)\b', lower):
        return None
    numbers = re.findall(r'\d+(?:[,.]\d+)*', reply)
    if any(n not in re.findall(r'\d+(?:[,.]\d+)*', user_message) for n in numbers):
        return None
    if re.search(r'[$₱€£¥%]|\b(?:pesos?|dollars?|percent)\b', reply, re.I):
        # Even echoed amounts are not verified ledger facts; ordinary counts may be echoed.
        return None
    if re.search(r'\b(?:zero|hundred|thousand|million)\b.*\b(?:balance|cash|pesos|dollars|debt)\b', lower):
        return None
    letters = [c for c in reply if c.isalpha()]
    if len(letters) > 12 and sum(c.isupper() for c in letters) / len(letters) > .45:
        return None
    if len(re.findall(r'\b(?:sis|bestie|girl)\b', lower)) > 1 or any(lower.count(x) > 1 for x in ('seriously', 'oh my god', 'oh honey')):
        return None
    words = re.findall(r"[a-z']+", lower)
    phrases = [tuple(words[i:i+3]) for i in range(len(words)-2)]
    if len(phrases) != len(set(phrases)):
        return None
    if reply[-1] not in '.!?…💕😭😂🙂😊🎉❤':
        return None  # output-cap truncation is common; avoid returning fragments
    return reply
