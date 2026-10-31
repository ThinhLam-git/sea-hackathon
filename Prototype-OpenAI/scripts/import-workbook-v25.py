"""Import team-approved v2.5 XLSX with Python 3 standard library only.

Run from Prototype-OpenAI: python scripts/import-workbook-v25.py PATH.xlsx
Then: node scripts/import-v2.mjs
Verify all mapped workbook fields: python scripts/import-workbook-v25.py PATH.xlsx --check
The archive is an immutable schema/template, never a source of scenario answers.
Workbook is read-only. No model calls, network, or spreadsheet dependencies.
"""
import argparse
import copy
import hashlib
import json
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / 'fixtures/v2'
PAIR = 'order-rescue-demo-30-v2.5'
POLICY = 'demo-two-assessment-v2.5'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def evaluate_formula(formula, values, row_number):
    """Strict evaluator for this contract's IF/AND/equality/same-row references only."""
    tokens = re.findall(r'"(?:[^"]|"")*"|\$?[A-Z]+\$?\d+|[A-Z_]+|\d+|[(),=]', formula)
    assert ''.join(tokens) == formula, f'Unsupported formula syntax: {formula}'
    position = 0

    def expression():
        nonlocal position
        token = tokens[position]
        position += 1
        if token in ('IF', 'AND'):
            assert tokens[position] == '('
            position += 1
            args = [expression()]
            while tokens[position] == ',':
                position += 1
                args.append(expression())
            assert tokens[position] == ')'
            position += 1
            if token == 'IF':
                assert len(args) == 3
                value = args[1] if args[0] else args[2]
            else:
                value = all(args)
        elif token.startswith('"'):
            value = token[1:-1].replace('""', '"')
        elif token.isdigit():
            value = token
        else:
            match = re.fullmatch(r'\$?([A-Z]+)\$?(\d+)', token)
            assert match and match[2] == row_number, f'Unsupported reference: {token}'
            value = values.get(match[1]) or ''
        if position < len(tokens) and tokens[position] == '=':
            position += 1
            value = value == expression()
        return value

    result = expression()
    assert position == len(tokens)
    return result


def read_rows(book):
    with zipfile.ZipFile(book) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        rels = {n.attrib['Id']: n.attrib['Target'] for n in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheet = next(n for n in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS) if n.attrib['name'] == '03 SCENARIOS')
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        rows = []
        for row in ET.fromstring(z.read(target)).findall('m:sheetData/m:row', NS):
            values = {}
            formulas = []
            for cell in row.findall('m:c', NS):
                if cell.find('m:f', NS) is not None:
                    formulas.append((cell.attrib['r'], cell.find('m:f', NS).text))
                value = cell.find('m:v', NS)
                text = value.text if value is not None else None
                if cell.attrib.get('t') == 's':
                    text = shared[int(text)]
                elif cell.attrib.get('t') == 'inlineStr':
                    text = ''.join(cell.find('m:is', NS).itertext())
                values[re.sub(r'\d+$', '', cell.attrib['r'])] = text
            if re.fullmatch(r'DEMO-\d{3}', values.get('A') or ''):
                for ref, formula in formulas:
                    col = re.sub(r'\d+$', '', ref)
                    calculated = evaluate_formula(formula, values, row.attrib['r'])
                    normalize = lambda v: (v or '').replace('\\n', '\n')
                    assert normalize(calculated) == normalize(values.get(col)), f'Stale formula cache: {ref}'
                rows.append(values)
    assert len(rows) == 30 and len({r['A'] for r in rows}) == 30
    return rows


def assessment(row, columns):
    ev, hypothesis, confidence, missing, question, action = columns
    if not row.get(hypothesis):
        assert all(not row.get(k) for k in columns), 'Partial empty assessment'
        return None
    # XLSX uses literal backslash-n separators in some exported evidence cells.
    lines = row[ev].replace('\\n', '\n').splitlines()
    evidence = []
    for line in lines:
        match = re.fullmatch(r'\[([^\]]+) / ([^\]]+)\] (.*)', line)
        assert match, f'Invalid evidence: {line}'
        ref, verification, fact = match.groups()
        evidence.append(dict(source_ref=ref, fact=fact, verification=verification))
    assert row[action] != 'HOLD_DISRUPTION', 'Retired action in active workbook'
    return dict(evidence=evidence, hypothesis=row[hypothesis], confidence=row[confidence],
                missing_info=json.loads(row[missing]), question_key=row.get(question) or None,
                candidate_action=row[action])


def policy_output(row, columns):
    if not row.get(columns[0]):
        assert all(not row.get(k) for k in columns), 'Partial empty policy'
        return None
    return dict(zip(['eligibility', 'policy_gate', 'final_action', 'reason'], [row[k] for k in columns]))


def retire_hold(obj):
    if isinstance(obj, list):
        return [retire_hold(x) for x in obj if x != 'HOLD_DISRUPTION' and not (isinstance(x, dict) and x.get('action_id') == 'HOLD_DISRUPTION')]
    if isinstance(obj, dict):
        return {k: retire_hold(v) for k, v in obj.items()}
    return obj


def generate(book, rows):
    seed = json.loads((BASE / 'archive/v2.4/seed.json').read_text(encoding='utf-8'))
    tests = json.loads((BASE / 'archive/v2.4/test-cases.json').read_text(encoding='utf-8'))
    # Rebuild T0 context registry exclusively from input cells, never expected evidence.
    old_interactions = {x['interaction_id']: x for x in seed['seed_data']['fact_rescue_interaction']}
    old_index = seed['source_ref_index']
    seed['source_ref_index'] = {}
    seed['seed_data']['fact_rescue_interaction'] = []
    for row in rows:
        cid = row['A']
        case = next(x for x in tests['test_cases'] if x['case_id'] == cid)
        rescue = next(x for x in seed['seed_data']['order_rescue'] if x['case_id'] == cid)
        order = next(x for x in seed['seed_data']['fact_order'] if x['order_id'] == rescue['order_id'])
        event = next(x for x in seed['seed_data']['fact_delivery_event'] if x['event_id'] == rescue['failed_event_id'])
        failed, context, history = json.loads(row['E']), json.loads(row['J']), json.loads(row['I'])
        assert history == [], 'Runtime only supports empty synthetic buyer_history; do not silently discard'
        assert context['policy_version'] == POLICY and row['D'] == 'FINAL'
        deadline = row['H']
        assert datetime.fromisoformat(deadline) > datetime.fromisoformat(failed['as_of'])
        assert datetime.fromisoformat(failed['time']) <= datetime.fromisoformat(failed['as_of'])
        order.update(operational_context=context, payment_type=context['payment'], current_status=failed['status'])
        rescue.update(attempts_used=int(row['F']), return_state=row['G'], deadline_at=deadline,
                      policy_version=POLICY, as_of=failed['as_of'], created_at=failed['as_of'], updated_at=failed['as_of'])
        event.update(event_status=failed['status'], courier_note=failed['courier_note'], reported_reason=failed['reported_reason'], event_time=failed['time'])
        event['raw_payload'] = {k: failed[k] for k in ['status', 'time', 'as_of', 'reported_reason']}
        for message in context.get('buyer_messages_t0', []):
            ref = message['source_ref']
            interaction = copy.deepcopy(old_interactions[ref])
            interaction.update(message_text=message['text'], payload={'text': message['text']},
                               occurred_at=message.get('occurred_at', failed['as_of']))
            seed['seed_data']['fact_rescue_interaction'].append(interaction)
        for ref in context['source_refs']:
            assert ref.startswith(cid + '-') and ref in old_index
            seed['source_ref_index'][ref] = copy.deepcopy(old_index[ref])
            assert seed['source_ref_index'][ref]['available_phase'] == 'T0'
        case.update(group=row['B'], description=row['C'], ground_truth_status=row['D'])
        sim = case['simulation']
        sim.update(response_mode=row['R'], buyer_reply=row.get('S') or None)
        if row['R'] == 'NOT_ASKED':
            sim['events_after_start'] = []
        else:
            response = sim['events_after_start'][0]
            response['occurred_at'] = (datetime.fromisoformat(failed['as_of']) + timedelta(minutes=2)).isoformat()
            if row['R'] == 'BUYER_REPLY':
                response['payload'] = {'text': row['S']}
            else:
                assert row['R'] == 'USER_NO_REPLY'
                response['payload'] = {'buyer_reply': None}
        expected = case['expected']
        expected.update(initial_assessment=assessment(row, ['K','L','M','N','O','P']),
                        initial_policy_output=policy_output(row, ['Z','AA','AB','AC']),
                        after_reply_assessment=assessment(row, ['T','U','V','W','X','Y']),
                        after_reply_policy_output=policy_output(row, ['AD','AE','AF','AG']),
                        final_assessment_source=int(row['AH']),
                        final_assessment=assessment(row, ['AI','AJ','AK','AL','AM','AN']),
                        final_policy_output=policy_output(row, ['AO','AP','AQ','AR']),
                        change_type=row['AS'], explanation=row['AT'])
        expected['question'].update(count=0 if row['R'] == 'NOT_ASKED' else 1,
                                    question_key=row.get('O') or None, reference_text=row.get('Q') or None)
    for obj in [seed, tests]:
        obj['metadata'].update(version='2.5', pair_id=PAIR, source_workbook=book.name)
        obj['shared_contract'].update(pair_id=PAIR, contract_version='2.5')
    tests['metadata']['source_workbook_sha256'] = hashlib.sha256(book.read_bytes()).hexdigest()
    seed['metadata']['status'] = 'Team-confirmed v2.5 synthetic fixture labels FINAL; not model accuracy.'
    seed['demo_policy_profile']['policy_version'] = POLICY
    return retire_hold(seed), retire_hold(tests)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--check', action='store_true', help='Read-only: verify all 30 workbook rows against active JSON and generated controls/replay')
    args = parser.parse_args()
    rows = read_rows(args.workbook)
    seed, tests = generate(args.workbook, rows)
    for name, obj in [('seed.json', seed), ('test-cases.json', tests)]:
        if args.check:
            assert json.loads((BASE / name).read_text(encoding='utf-8')) == obj, f'{name} differs from workbook mapping'
        else:
            (BASE / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.check:
        replay = json.loads((BASE / 'replay.json').read_text(encoding='utf-8'))
        controls = json.loads((BASE / 'controls.json').read_text(encoding='utf-8'))
        assert replay['prompt_version'] == 'assess-v2.5.0' and replay['policy_version'] == POLICY
        for case, control in zip(tests['test_cases'], controls):
            cid, e = case['case_id'], case['expected']
            assert replay['cases'][cid] == {'INITIAL': e['initial_assessment'], 'AFTER_REPLY': e['after_reply_assessment']}
            assert control == dict(case_id=cid, group=case['group'], buyer_reply=case['simulation']['buyer_reply'],
                                   response_mode=case['simulation']['response_mode'], question_text=e['question']['reference_text'])
        print('Verified all 30 workbook rows: input, initial/after/final assessments and policies, questions, replies, replay and controls.')
    else:
        print('Imported all 30 v2.5 workbook rows; run node scripts/import-v2.mjs to regenerate replay/controls/provenance.')


if __name__ == '__main__':
    main()
