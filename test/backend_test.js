const assert = require('assert')
const Automerge = require('../src/automerge')
const Backend = Automerge.Backend
const { encodeChange, decodeChange } = require('../backend/columnar')
const uuid = require('../src/uuid')
const ROOT_ID = '00000000-0000-0000-0000-000000000000'

function hash(change) {
  return decodeChange(encodeChange(change)).hash
}

describe('Automerge.Backend', () => {
  describe('incremental diffs', () => {
    it('should assign to a key in a map', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      assert.deepStrictEqual(patch1, {
        version: 1, clock: {[actor]: 1}, deps: [hash(change1)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {[`1@${actor}`]: {value: 'magpie'}}
        }}
      })
    })

    it('should increment a key in a map', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'counter', value: 1, datatype: 'counter', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'inc', obj: ROOT_ID, key: 'counter', value: 2, pred: [`1@${actor}`]}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          counter: {[`1@${actor}`]: {value: 3, datatype: 'counter'}}
        }}
      })
    })

    it('should make a conflict on assignment to the same key', () => {
      const change1 = {actor: '111111', seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: []}
      ]}
      const change2 = {actor: '222222', seq: 1, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'blackbird', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {111111: 1, 222222: 1}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {'1@111111': {value: 'magpie'}, '2@222222': {value: 'blackbird'}}
        }}
      })
    })

    it('should delete a key from a map', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'del', obj: ROOT_ID, key: 'bird', pred: [`1@${actor}`]}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {bird: {}}}
      })
    })

    it('should create nested maps', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeMap', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: 'wrens', value: 3, pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      assert.deepStrictEqual(patch1, {
        version: 1, clock: {[actor]: 1}, deps: [hash(change1)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'map', props: {wrens: {[`2@${actor}`]: {value: 3}}}
        }}}}
      })
    })

    it('should assign to keys in nested maps', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeMap', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: 'wrens', value: 3, pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 3, time: 0, deps: [hash(change1)], ops: [
        {action: 'set', obj: `1@${actor}`, key: 'sparrows', value: 15, pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'map', props: {sparrows: {[`3@${actor}`]: {value: 15}}}
        }}}}
      })
    })

    it('should create lists', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: 'chaffinch', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      assert.deepStrictEqual(patch1, {
        version: 1, clock: {[actor]: 1}, deps: [hash(change1)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}],
          props: {0: {[`2@${actor}`]: {value: 'chaffinch'}}}
        }}}}
      })
    })

    it('should apply updates inside lists', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: 'chaffinch', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 3, time: 0, deps: [hash(change1)], ops: [
        {action: 'set', obj: `1@${actor}`, key: `2@${actor}`, value: 'greenfinch', pred: [`2@${actor}`]}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list', edits: [],
          props: {0: {[`3@${actor}`]: {value: 'greenfinch'}}}
        }}}}
      })
    })

    it('should delete list elements', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: 'chaffinch', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 3, time: 0, deps: [hash(change1)], ops: [
        {action: 'del', obj: `1@${actor}`, key: `2@${actor}`, pred: [`2@${actor}`]}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list', props: {},
          edits: [{action: 'remove', index: 0}]
        }}}}
      })
    })

    it('should handle list element insertion and deletion in the same change', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: 'chaffinch', pred: []},
        {action: 'del', obj: `1@${actor}`, key: `2@${actor}`, pred: [`2@${actor}`]}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      assert.deepStrictEqual(patch2, {
        version: 2, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list', edits: [
            {action: 'insert', index: 0}, {action: 'remove', index: 0}
          ], props: {}
        }}}}
      })
    })

    it('should handle changes within conflicted objects', () => {
      const actor1 = uuid(), actor2 = uuid()
      const change1 = {actor: actor1, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'conflict', pred: []}
      ]}
      const change2 = {actor: actor2, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeMap',  obj: ROOT_ID, key: 'conflict', pred: []}
      ]}
      const change3 = {actor: actor2, seq: 2, startOp: 2, time: 0, deps: [hash(change2)], ops: [
        {action: 'set', obj: `1@${actor2}`, key: 'sparrows', value: 12, pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(change1)])
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(change2)])
      const [s3, patch3] = Backend.applyChanges(s2, [encodeChange(change3)])
      assert.deepStrictEqual(patch3, {
        version: 3, clock: {[actor1]: 1, [actor2]: 2},
        deps: [hash(change1), hash(change3)].sort(),
        diffs: {objectId: ROOT_ID, type: 'map', props: {conflict: {
          [`1@${actor1}`]: {objectId: `1@${actor1}`, type: 'list'},
          [`1@${actor2}`]: {objectId: `1@${actor2}`, type: 'map', props: {sparrows: {[`2@${actor2}`]: {value: 12}}}}
        }}}
      })
    })

    it('should support Date objects at the root', () => {
      const now = new Date()
      const actor = uuid(), change = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'now', value: now.getTime(), datatype: 'timestamp', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch] = Backend.applyChanges(s0, [encodeChange(change)])
      assert.deepStrictEqual(patch, {
        version: 1, clock: {[actor]: 1}, deps: [hash(change)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          now: {[`1@${actor}`]: {value: now.getTime(), datatype: 'timestamp'}}
        }}
      })
    })

    it('should support Date objects in a list', () => {
      const now = new Date(), actor = uuid()
      const change = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'list', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: now.getTime(), datatype: 'timestamp', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch] = Backend.applyChanges(s0, [encodeChange(change)])
      assert.deepStrictEqual(patch, {
        version: 1, clock: {[actor]: 1}, deps: [hash(change)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {list: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}],
          props: {0: {[`2@${actor}`]: {value: now.getTime(), datatype: 'timestamp'}}}
        }}}}
      })
    })
  })

  describe('applyLocalChange()', () => {
    it('should apply change requests', () => {
      const change1 = {requestType: 'change', actor: '111111', seq: 1, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie'}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyLocalChange(s0, change1)
      const changes01 = Backend.getChanges(s1, []).map(decodeChange)
      assert.deepStrictEqual(patch1, {
        actor: '111111', seq: 1, version: 1, clock: {'111111': 1}, deps: [changes01[0].hash],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {['1@111111']: {value: 'magpie'}}
        }}
      })
      assert.deepStrictEqual(changes01, [{
        hash: '442651a167f5f362db4e2b33c5ce276e9d327170633a4f798d6cec353ac0d76c',
        actor: '111111', seq: 1, startOp: 1, time: 0, message: '', deps: [], ops: [
          {action: 'set', obj: ROOT_ID, key: 'bird', insert: false, value: 'magpie', pred: []}
        ]
      }])
    })

    it('should throw an exception on duplicate requests', () => {
      const actor = uuid()
      const change1 = {requestType: 'change', actor, seq: 1, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie'}
      ]}
      const change2 = {requestType: 'change', actor, seq: 2, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'jay'}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyLocalChange(s0, change1)
      const [s2, patch2] = Backend.applyLocalChange(s1, change2)
      assert.throws(() => Backend.applyLocalChange(s2, change1), /Change request has already been applied/)
      assert.throws(() => Backend.applyLocalChange(s2, change2), /Change request has already been applied/)
    })

    it('should handle frontend and backend changes happening concurrently', () => {
      const local1 = {requestType: 'change', actor: '111111', seq: 1, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie'}
      ]}
      const local2 = {requestType: 'change', actor: '111111', seq: 2, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'jay'}
      ]}
      const remote1 = {actor: '222222', seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'fish', value: 'goldfish', pred: []}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyLocalChange(s0, local1)
      const changes01 = Backend.getChanges(s1, []).map(decodeChange)
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(remote1)])
      const changes12 = Backend.getChanges(s2, [changes01[0].hash]).map(decodeChange)
      const [s3, patch3] = Backend.applyLocalChange(s2, local2)
      const changes23 = Backend.getChanges(s3, [changes01[0].hash, changes12[0].hash]).map(decodeChange)
      assert.deepStrictEqual(changes01, [{
        hash: '442651a167f5f362db4e2b33c5ce276e9d327170633a4f798d6cec353ac0d76c',
        actor: '111111', seq: 1, startOp: 1, time: 0, message: '', deps: [], ops: [
          {action: 'set', obj: ROOT_ID, key: 'bird', insert: false, value: 'magpie', pred: []}
        ]
      }])
      assert.deepStrictEqual(changes12, [{
        hash: '51fbd2710738fdadf426befb08befea5816196715e457b64bde3d5d621d725d4',
        actor: '222222', seq: 1, startOp: 1, time: 0, message: '', deps: [], ops: [
          {action: 'set', obj: ROOT_ID, key: 'fish', insert: false, value: 'goldfish', pred: []}
        ]
      }])
      assert.deepStrictEqual(changes23, [{
        hash: '64b47cbb40ae01dc35e416d028ef30584312746e4658b102b955568b8e69aabb',
        actor: '111111', seq: 2, startOp: 2, time: 0, message: '', deps: [changes01[0].hash], ops: [
          {action: 'set', obj: ROOT_ID, key: 'bird', insert: false, value: 'jay', pred: ['1@111111']}
        ]
      }])
    })

    it('should detect conflicts based on the frontend version', () => {
      const local1 = {requestType: 'change', actor: '111111', seq: 1, time: 0, version: 0, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'goldfinch'}
      ]}
      // remote1 depends on local1; the deps field is filled in below when we've computed the hash
      const remote1 = {actor: '222222', seq: 1, startOp: 2, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: ['1@111111']}
      ]}
      // local2 is concurrent with remote1 (because version < 2)
      const local2 = {requestType: 'change', actor: '111111', seq: 2, time: 0, version: 1, ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'jay'}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyLocalChange(s0, local1)
      const changes01 = Backend.getChanges(s1, []).map(decodeChange)
      remote1.deps.push(changes01[0].hash)
      const [s2, patch2] = Backend.applyChanges(s1, [encodeChange(remote1)])
      const changes12 = Backend.getChanges(s2, [changes01[0].hash]).map(decodeChange)
      const [s3, patch3] = Backend.applyLocalChange(s2, local2)
      const changes23 = Backend.getChanges(s3, [changes12[0].hash]).map(decodeChange)
      assert.deepStrictEqual(patch3, {
        actor: '111111', seq: 2, version: 3, clock: {'111111': 2, '222222': 1},
        deps: [changes23[0].hash, hash(remote1)].sort(),
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {'2@222222': {value: 'magpie'}, '2@111111': {value: 'jay'}}
        }}
      })
      assert.deepStrictEqual(changes23, [{
        hash: '1387476c317fff61163e9ed885f7856688efc24be664f8da69bcd577fc8db732',
        actor: '111111', seq: 2, startOp: 2, time: 0, message: '', deps: [changes01[0].hash], ops: [
          {action: 'set', obj: ROOT_ID, key: 'bird', insert: false, value: 'jay', pred: ['1@111111']}
        ]
      }])
    })

    it('should transform list indexes into element IDs', () => {
      const remote1 = {actor: '222222', seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {obj: ROOT_ID, action: 'makeList', key: 'birds', pred: []}
      ]}
      const remote2 = {actor: '222222', seq: 2, startOp: 2, time: 0, deps: [hash(remote1)], ops: [
        {obj: '1@222222', action: 'set', key: '_head', insert: true, value: 'magpie', pred: []}
      ]}
      const local1 = {requestType: 'change', actor: '111111', seq: 1, time: 0, version: 1, ops: [
        {obj: '1@222222', action: 'set', key: 0, insert: true, value: 'goldfinch'}
      ]}
      const local2 = {requestType: 'change', actor: '111111', seq: 2, time: 0, version: 1, ops: [
        {obj: '1@222222', action: 'set', key: 1, insert: true, value: 'wagtail'}
      ]}
      const local3 = {requestType: 'change', actor: '111111', seq: 3, time: 0, version: 4, ops: [
        {obj: '1@222222', action: 'set', key: 0, value: 'Magpie'},
        {obj: '1@222222', action: 'set', key: 1, value: 'Goldfinch'}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyChanges(s0, [encodeChange(remote1)])
      const [s2, patch2] = Backend.applyLocalChange(s1, local1)
      const changes12 = Backend.getChanges(s2, [hash(remote1)]).map(decodeChange)
      const [s3, patch3] = Backend.applyChanges(s2, [encodeChange(remote2)])
      const [s4, patch4] = Backend.applyLocalChange(s3, local2)
      const changes34 = Backend.getChanges(s4, [hash(remote2), changes12[0].hash]).map(decodeChange)
      const [s5, patch5] = Backend.applyLocalChange(s4, local3)
      const changes45 = Backend.getChanges(s5, [hash(remote2), changes34[0].hash]).map(decodeChange)
      assert.deepStrictEqual(changes12, [{
        hash: '9e4bfa0cfa532c4b0c0d4a98edb2b833753d23978122f632da42d4cad81062ea',
        actor: '111111', seq: 1, startOp: 2, time: 0, message: '', deps: [hash(remote1)], ops: [
          {obj: '1@222222', action: 'set', key: '_head', insert: true, value: 'goldfinch', pred: []}
        ]
      }])
      assert.deepStrictEqual(changes34, [{
        hash: '989560a58e050781303f27751fca5db6b68e3435eaeb628468d87bb18368384f',
        actor: '111111', seq: 2, startOp: 3, time: 0, message: '', deps: [changes12[0].hash], ops: [
          {obj: '1@222222', action: 'set', key: '2@111111', insert: true, value: 'wagtail', pred: []}
        ]
      }])
      assert.deepStrictEqual(changes45, [{
        hash: 'dd37ad188ecda7986467e8ff382667d3417cf5962bbbba9ddc7eb6fc049f718c',
        actor: '111111', seq: 3, startOp: 4, time: 0, message: '',
        deps: [hash(remote2), changes34[0].hash].sort(), ops: [
          {obj: '1@222222', action: 'set', key: '2@222222', insert: false, value: 'Magpie',    pred: ['2@222222']},
          {obj: '1@222222', action: 'set', key: '2@111111', insert: false, value: 'Goldfinch', pred: ['2@111111']}
        ]
      }])
    })

    it('should handle list element insertion and deletion in the same change', () => {
      const local1 = {requestType: 'change', actor: '111111', seq: 1, startOp: 1, time: 0, version: 0, ops: [
        {obj: ROOT_ID, action: 'makeList', key: 'birds'}
      ]}
      const local2 = {requestType: 'change', actor: '111111', seq: 2, startOp: 2, time: 0, version: 0, ops: [
        {obj: '1@111111', action: 'set', key: 0, insert: true, value: 'magpie'},
        {obj: '1@111111', action: 'del', key: 0}
      ]}
      const s0 = Backend.init()
      const [s1, patch1] = Backend.applyLocalChange(s0, local1)
      const [s2, patch2] = Backend.applyLocalChange(s1, local2)
      const changes = Backend.getChanges(s2, []).map(decodeChange)
      assert.deepStrictEqual(patch2, {
        actor: '111111', seq: 2, version: 2, clock: {'111111': 2}, deps: [changes[1].hash],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          birds: {['1@111111']: {objectId: '1@111111', type: 'list',
            edits: [{action: 'insert', index: 0}, {action: 'remove', index: 0}],
            props: {}
          }}
        }}
      })
      assert.deepStrictEqual(changes, [{
        hash: changes[0].hash, actor: '111111', seq: 1, startOp: 1, time: 0, message: '', deps: [], ops: [
          {obj: ROOT_ID, action: 'makeList', key: 'birds', insert: false, pred: []}
        ]
      }, {
        hash: 'e4ac64e701a14d92b3096cfa9763178f9b778039b596189e3e7efbdd1b2f0b35',
        actor: '111111', seq: 2, startOp: 2, time: 0, message: '', deps: [changes[0].hash], ops: [
          {obj: '1@111111', action: 'set', key: '_head', insert: true, value: 'magpie', pred: []},
          {obj: '1@111111', action: 'del', key: '2@111111', insert: false, pred: ['2@111111']}
        ]
      }])
    })
  })

  describe('getPatch()', () => {
    it('should include the most recent value for a key', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'blackbird', pred: [`1@${actor}`]}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {[`2@${actor}`]: {value: 'blackbird'}}
        }}
      })
    })

    it('should include conflicting values for a key', () => {
      const change1 = {actor: '111111', seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'magpie', pred: []}
      ]}
      const change2 = {actor: '222222', seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'bird', value: 'blackbird', pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {111111: 1, 222222: 1}, deps: [hash(change1), hash(change2)].sort(),
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          bird: {'1@111111': {value: 'magpie'}, '1@222222': {value: 'blackbird'}}
        }}
      })
    })

    it('should handle counter increments at a key in a map', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'counter', value: 1, datatype: 'counter', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'inc', obj: ROOT_ID, key: 'counter', value: 2, pred: [`1@${actor}`]}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          counter: {[`1@${actor}`]: {value: 3, datatype: 'counter'}}
        }}
      })
    })

    it('should handle deletion of a counter', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'counter', value: 1, datatype: 'counter', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 2, time: 0, deps: [hash(change1)], ops: [
        {action: 'inc', obj: ROOT_ID, key: 'counter', value: 2, pred: [`1@${actor}`]}
      ]}
      const change3 = {actor, seq: 3, startOp: 3, time: 0, deps: [hash(change2)], ops: [
        {action: 'del', obj: ROOT_ID, key: 'counter', pred: [`1@${actor}`]}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2, change3].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 3}, deps: [hash(change3)],
        diffs: {objectId: ROOT_ID, type: 'map'}
      })
    })

    it('should create nested maps', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeMap', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: 'wrens', value: 3,     pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 3, time: 0, deps: [hash(change1)], ops: [
        {action: 'del', obj: `1@${actor}`, key: 'wrens', pred: [`2@${actor}`]},
        {action: 'set', obj: `1@${actor}`, key: 'sparrows', value: 15, pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'map', props: {sparrows: {[`4@${actor}`]: {value: 15}}}
        }}}}
      })
    })

    it('should create lists', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: 'chaffinch', pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [encodeChange(change1)])
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 1}, deps: [hash(change1)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}],
          props: {0: {[`2@${actor}`]: {value: 'chaffinch'}}}
        }}}}
      })
    })

    it('should include the latest state of a list', () => {
      const actor = uuid()
      const change1 = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'birds', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head',      insert: true, value: 'chaffinch', pred: []},
        {action: 'set', obj: `1@${actor}`, key: `2@${actor}`, insert: true, value: 'goldfinch', pred: []}
      ]}
      const change2 = {actor, seq: 2, startOp: 4, time: 0, deps: [hash(change1)], ops: [
        {action: 'del', obj: `1@${actor}`, key: `2@${actor}`, pred: [`2@${actor}`]},
        {action: 'set', obj: `1@${actor}`, key: `2@${actor}`, insert: true, value: 'greenfinch', pred: []},
        {action: 'set', obj: `1@${actor}`, key: `3@${actor}`, value: 'goldfinches!!', pred: [`3@${actor}`]}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [change1, change2].map(encodeChange))
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 2}, deps: [hash(change2)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {birds: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}, {action: 'insert', index: 1}],
          props: {0: {[`5@${actor}`]: {value: 'greenfinch'}}, 1: {[`6@${actor}`]: {value: 'goldfinches!!'}}}
        }}}}
      })
    })

    it('should handle nested maps in lists', () => {
      const actor = uuid()
      const change = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'todos', pred: []},
        {action: 'makeMap', obj: `1@${actor}`, key: '_head', insert: true, pred: []},
        {action: 'set', obj: `2@${actor}`, key: 'title', value: 'water plants', pred: []},
        {action: 'set', obj: `2@${actor}`, key: 'done', value: false, pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [encodeChange(change)])
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 1}, deps: [hash(change)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {todos: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}],
          props: {0: {[`2@${actor}`]: {
            objectId: `2@${actor}`, type: 'map', props: {
              title: {[`3@${actor}`]: {value: 'water plants'}},
              done:  {[`4@${actor}`]: {value: false}}
            }
          }}}
        }}}}
      })
    })

    it('should include Date objects at the root', () => {
      const now = new Date()
      const actor = uuid(), change = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'set', obj: ROOT_ID, key: 'now', value: now.getTime(), datatype: 'timestamp', pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [encodeChange(change)])
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 1}, deps: [hash(change)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {
          now: {[`1@${actor}`]: {value: now.getTime(), datatype: 'timestamp'}}
        }}
      })
    })

    it('should include Date objects in a list', () => {
      const now = new Date(), actor = uuid()
      const change = {actor, seq: 1, startOp: 1, time: 0, deps: [], ops: [
        {action: 'makeList', obj: ROOT_ID, key: 'list', pred: []},
        {action: 'set', obj: `1@${actor}`, key: '_head', insert: true, value: now.getTime(), datatype: 'timestamp', pred: []}
      ]}
      const s1 = Backend.loadChanges(Backend.init(), [encodeChange(change)])
      assert.deepStrictEqual(Backend.getPatch(s1), {
        version: 0, clock: {[actor]: 1}, deps: [hash(change)],
        diffs: {objectId: ROOT_ID, type: 'map', props: {list: {[`1@${actor}`]: {
          objectId: `1@${actor}`, type: 'list',
          edits: [{action: 'insert', index: 0}],
          props: {0: {[`2@${actor}`]: {value: now.getTime(), datatype: 'timestamp'}}}
        }}}}
      })
    })
  })
})
