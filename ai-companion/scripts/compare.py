#!/usr/bin/env python3
"""Summarize saved synthetic runs; no inference and no subjective scoring."""
import argparse
import json
from pathlib import Path
from reporting import summarize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('results', nargs='+', type=Path)
    args = parser.parse_args()
    for path in args.results:
        data = json.loads(path.read_text())
        print(json.dumps({'file': str(path), 'configuration': data.get('configuration'),
                          'summary': summarize(data['rows'])}, indent=2))
    print('Compare matched scenarios/personality/chaos/configuration; mixed sources distort latency. Review humor and relevance manually.')


if __name__ == '__main__':
    main()
