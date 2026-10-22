"""Small conservative pattern policy, not sentiment understanding or a complete safety classifier."""
from dataclasses import dataclass
import re
import unicodedata
from .schemas import Tone


@dataclass(frozen=True)
class Decision:
    tone: Tone
    reason: str | None = None


def classify(message: str, requested: Tone) -> Decision:
    text = unicodedata.normalize('NFKC', message).lower().replace('’', "'")
    if re.search(r"\b(medic(?:al|ation|ine)|doctor|hospital|urgent care|surgery|appointment|gamot|ospital)\b", text):
        return Decision(Tone.supportive, 'medical')
    hardship = r"can't afford|cannot afford|can not afford|unable to afford|struggl\w*|can't pay|cannot pay|no money|not enough|evict\w*|homeless|hungry|starving|walang pera|di afford|hindi afford"
    if re.search(hardship, text):
        return Decision(Tone.supportive, 'hardship')
    if re.search(r'ignore.*(?:rules|instructions)|system prompt|pretend.*(?:sav|record|balanc)|tell me.*balanc|act as.*system', text):
        return Decision(Tone.informational, 'unsupported')
    if re.search(r'\b(add|delete|remove|edit|save|record|transfer|deposit|withdraw|sync)\b.*\b(transaction|record|expense|income|money|fund|loan|payment)\b', text):
        return Decision(Tone.informational, 'unsupported')
    if (requested == Tone.informational or re.search(
            r'how much|what(?:\x27s| is|s) my|my (?:current )?balance|calculate|compute|remaining (?:cash|budget)|money.*left|can i afford|magkano|how many.*(?:loans|payments)', text)):
        return Decision(Tone.informational, 'missing_data')
    if requested == Tone.celebratory and not re.search(r'paid off|reached|stayed within|finally|goal|finished|completed|achieved|milestone', text):
        return Decision(Tone.supportive, 'supportive')
    if requested == Tone.supportive:
        return Decision(Tone.supportive, 'supportive')
    if re.search(r'\b(rent|groceries|food|housing|utilities|essential|electricity|tuition)\b', text) and not re.search(r'treat|fancy|luxury|expensive lunch', text):
        return Decision(Tone.supportive, 'essential')
    return Decision(requested)
