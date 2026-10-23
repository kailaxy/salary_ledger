#!/usr/bin/env python3
"""Create private manual-review sheets or an offline synthetic ceiling-test pack."""
import argparse
import csv
from io import StringIO
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.policy import classify
from app.prompt_builder import messages
from app.schemas import ChatRequest
from benchmark import QUALITY, write_private


def safe_cell(value):
    value = str(value)
    return "'" + value if value.lstrip().startswith(('=', '+', '-', '@')) else value


def review_csv(data):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['run', 'scenario', 'input', 'reply', 'source', 'reason', 'validationReason',
                     'relevant_0_or_1', 'grounded_0_or_1', 'funny_1_to_5', 'unsolicited_advice_0_or_1', 'notes'])
    for row in data['rows']:
        response = row.get('response', {})
        writer.writerow([row.get('run', 1), row.get('scenarioId', row.get('caseId')),
                         safe_cell(row['input']['message']), safe_cell(response.get('reply', '')),
                         response.get('source', 'error'), response.get('reason', ''), response.get('validationReason') or '',
                         '', '', '', '', ''])
    return output.getvalue()


def ceiling_pack():
    rows = []
    for index, (message, tone) in enumerate(QUALITY, 1):
        request = ChatRequest(message=message, tone=tone, personality='financial_gremlin', chaosLevel=70)
        decision = classify(message, request.tone)
        rows.append({'scenarioId': index, 'input': request.model_dump(mode='json'),
                     'policyReason': decision.reason, 'runModel': decision.reason is None,
                     'messages': messages(request, decision) if decision.reason is None else None})
    return {'syntheticPrompts': True, 'instructions': 'Offline export only. Compare identical messages on an independently chosen stronger model. Policy cases stay deterministic. Do not upload real ledger data. Review using the same rubric; record provider/model/version/settings manually.', 'rows': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('result', nargs='?', type=Path)
    parser.add_argument('--ceiling-pack', action='store_true')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.ceiling_pack:
        if args.result:
            parser.error('Ceiling pack uses only frozen synthetic cases, not a result file')
        content = json.dumps(ceiling_pack(), ensure_ascii=False, indent=2)
    else:
        if not args.result:
            parser.error('Provide a benchmark JSON result or --ceiling-pack')
        content = review_csv(json.loads(args.result.read_text()))
    try:
        write_private(args.output, content)
    except FileExistsError:
        parser.error('Output exists; choose a new filename')
    print(args.output)


if __name__ == '__main__':
    main()
