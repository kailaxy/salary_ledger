"""Narrow drift checks; not a semantic verifier. Reject uncertainty, never repair text."""
import re

NUMBER_WORDS = dict(zip('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(), map(str, range(21))))
PURCHASES = {
    'coffee': r'coffees?', 'latte': r'lattes?', 'tea': r'(?:milk\s+)?teas?',
    'lunch': r'lunch(?:es)?', 'shoe': r'shoes?', 'snack': r'snacks?',
    'motorcycle': r'motorcycles?', 'car': r'cars?',
}
PROPERTIES = ('iced', 'regular', 'hot', 'cold', 'decaf', 'espresso', 'luxury', 'designer')


def canonical(text):
    text = text.lower().replace('’', "'")
    return re.sub(r'\b(' + '|'.join(NUMBER_WORDS) + r')\b', lambda m: NUMBER_WORDS[m[0]], text)


def positive_mentions(text):
    # Limited explicit negation: do not treat "not iced coffees" as evidence.
    return re.sub(r"\b(?:not|no|never|didn't|haven't|haven’t)\b[^.!?;,]*", '', text)


def grounded(reply, message):
    out, user = canonical(reply), canonical(message)
    positive = positive_mentions(user)
    # Broader financial status is not established by paying a particular loan.
    if re.search(r'\b(?:debt[ -]?free|free (?:of|from) (?:all )?debt|(?:zero|0|no) (?:remaining |more )?debts?|all (?:your )?debts? (?:is |are )?(?:gone|paid)|perfect credit|credit score)\b', out):
        return False
    if re.search(r'\b(?:over ?budget|overspent|budget deficit|overdrawn)\b', out):
        if not any(term in positive for term in ('over budget', 'overbudget', 'overspent', 'budget deficit', 'overdrawn', 'too much')):
            return False
    if re.search(r'\b(?:savings? (?:goal|target).*(?:reached|achieved|met)|(?:reached|achieved|met).*(?:savings? (?:goal|target)))\b', out):
        if not re.search(r'\b(?:reached|achieved|met|hit|completed)\b.*\b(?:goal|target)\b', positive):
            return False
    # Generic purchase counts still cannot introduce a different quantity.
    for count in re.findall(r'\b(\d+)\s+(?:beverages?|drinks?|cups?)\b', out):
        if count not in re.findall(r'\b\d+\b', positive):
            return False
    for pattern in PURCHASES.values():
        if re.search(r'\b' + pattern + r'\b', out):
            if not re.search(r'\b' + pattern + r'\b', positive):
                return False
            # Counts adjacent to purchase nouns may be restated in words/digits.
            for count in re.findall(r'\b(\d+)\s+(?:(?:regular|iced|hot|cold|decaf)\s+)?' + pattern + r'\b', out):
                if not re.search(r'\b' + re.escape(count) + r'\s+(?:(?:regular|iced|hot|cold|decaf)\s+)?' + pattern + r'\b', positive):
                    return False
    for prop in PROPERTIES:
        if re.search(r'\b' + prop + r'\b', out) and not re.search(r'\b' + prop + r'\b', positive):
            return False
    return True
