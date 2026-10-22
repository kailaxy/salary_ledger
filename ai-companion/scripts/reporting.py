"""Development-only synthetic benchmark aggregation, compatible with v1 rows."""
from collections import Counter
import re
import statistics


def distribution(values):
    return {'count': len(values), 'average': statistics.mean(values) if values else None,
            'median': statistics.median(values) if values else None,
            'min': min(values) if values else None, 'max': max(values) if values else None}


def summarize(rows):
    valid = [r for r in rows if 'response' in r]
    generated = [r for r in valid if r['response']['source'] == 'gemma']
    fallbacks = [r for r in valid if r['response']['source'] == 'fallback']
    def timing(key, scale=1):
        return distribution([r['response']['modelTimings'][key] / scale for r in generated
                             if key in (r['response'].get('modelTimings') or {})])
    openings = Counter(' '.join(re.findall(r"[a-z']+", r['response']['reply'].lower())[:2]) for r in generated)
    return {
        'completed': len(valid), 'errors': len(rows)-len(valid),
        'gemmaResponses': len(generated), 'fallbackResponses': len(fallbacks),
        'clientLatencyMs': distribution([r['clientLatencyMs'] for r in valid]),
        'generatedClientLatencyMs': distribution([r['clientLatencyMs'] for r in generated]),
        'fallbackClientLatencyMs': distribution([r['clientLatencyMs'] for r in fallbacks]),
        'generatedHandlerDurationMs': distribution([r['response']['durationMs'] for r in generated]),
        'modelLoadMs': timing('load_duration', 1_000_000),
        'promptEvaluationMs': timing('prompt_eval_duration', 1_000_000),
        'generationMs': timing('eval_duration', 1_000_000),
        'modelTotalMs': timing('total_duration', 1_000_000),
        'promptEvaluationTokens': timing('prompt_eval_count'), 'generationTokens': timing('eval_count'),
        'generatedWordLengths': distribution([len(r['response']['reply'].split()) for r in generated]),
        'fallbackWordLengths': distribution([len(r['response']['reply'].split()) for r in fallbacks]),
        'commonGeneratedOpenings': dict(openings.most_common(10)),
        'validationRejections': dict(Counter(r['response'].get('validationReason') or 'unspecified'
                                            for r in fallbacks if r['response']['reason'] == 'invalid_output')),
        'fallbackReasons': dict(Counter(r['response']['reason'] for r in fallbacks)),
        'qualitativeReview': 'Manual review required; no automated humor or safety score.',
    }
