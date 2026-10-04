// 테스트 전용 예시 데이터.
// 앱의 예시(store.sampleState)에서는 '은행조회서 회신'(박준호 과장)을 뺐지만,
// 기존 독촉·우선순위·보고 테스트는 그 건을 기준으로 짜여 있어 테스트에서만 다시 넣는다.
// 반대로 앱 예시에 새로 넣은 외부조회 건은 여기서 뺀다.

import { addDays } from '../src/js/lib/dates.js';
import { sampleState as appSample, DEMO_DATE } from '../src/js/store.js';

export function sampleState() {
  const d = (n) => addDays(DEMO_DATE, n);
  const s = appSample();
  // 앱 예시의 외부조회 건(kind: 'confirmation')과 그 조회처는 빼서, 예전 PBC 6건 기준을 그대로 쓴다.
  const pbc = s.items.filter((x) => x.kind !== 'confirmation');
  const owners = new Set(pbc.map((x) => x.owner));
  const people = Object.fromEntries(Object.entries(s.people).filter(([name]) => owners.has(name)));
  const { confirmSetup, materiality, ...rest } = s;
  return {
    ...rest,
    people: { ...people, '박준호 과장': { dept: '재무팀', nudges: 1, lastNudgedOn: d(-1) } },
    items: [
      { id: 'i1', name: '은행조회서 회신', owner: '박준호 과장', requestedOn: d(-3), neededOn: d(1), status: 'none',
        procedure: '은행 조회', nudges: [{ on: d(-1), tone: 'angel' }] },
      ...pbc,
    ],
  };
}
