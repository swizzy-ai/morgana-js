// @studiomorgana/helpers — bricks: compound sentences assembled from the verbs.
//
// A brick is the thing a page would otherwise hand-write more than twice: a
// run of equal parts, a meter of labelled cells, a segmented control, a list
// whose rows follow state. They live here — in one place, already typed and
// already tuned — so page code states the idea once and never writes a loop:
//
//   const { create, place, make, set, fill, bricks } = helpers(ctx, myTheme)
//
//   bricks.repeat(10, () => …, (seg, i) => …)   — fixed-count runs, no page loops
//   bricks.onlyWhile(key, 'authStep', 'email')  — hidden unless the state value holds
//   bricks.cells(meter, [['m-time', 'Time', 'meter.time']])  — labelled live cells
//   bricks.segmented(foot, 'theme.mode', [['system', 'System'], …])  — pill group
//   bricks.rows('log', line, 'log')             — a list whose rows follow state
//
// Every brick ends in ordinary verb calls, so bricks mix freely with the rest
// of a sentence.
import type { ObjectHandle } from '@studiomorgana/sdk'
import type { Verbs } from './index'

type Handle = ObjectHandle<any>

/** Looks for a labelled cell. Names are theme appearance names. */
export interface CellLooks {
  /** The cell itself. */
  cell: string
  /** Its small caption. */
  label: string
  /** Its live value, bound to the state path. */
  value: string
}

const CELL_LOOKS: CellLooks = { cell: 'cell', label: 'cap', value: 'cellValue' }

/** The verbs a brick needs — the subset of `helpers()` it weaves into sentences. */
export interface BrickVerbs {
  create: Verbs['create']
  place: Verbs['place']
  make: Verbs['make']
  set: Verbs['set']
  fill: Verbs['fill']
}

export class Bricks {
  constructor(private readonly v: BrickVerbs) {}

  /**
   * Fixed-count repetition without a loop at the call site. Builds the first
   * part, then clone()s it for every further index — the clone inherits
   * everything, `configure` fixes its id and any per-index look. Unplaced,
   * like any clone: `place(seg).in(track)` each — or place them yourself.
   *
   *   bricks.repeat(10,
   *     () => make(create.box('conv-seg')).rounded().height(1.5).background('track').done(),
   *     (seg, i) => seg.setProps({ id: `conv-seg-${i}` }))
   */
  repeat(count: number, build: () => Handle, configure: (clone: Handle, i: number) => void = (c) => c): Handle[] {
    if (count < 1) return []
    const first = build()
    const parts = [first]
    for (let i = 1; i < count; i++) {
      const clone = first.clone() as Handle
      configure(clone, i)
      parts.push(clone)
    }
    return parts
  }

  /**
   * Shown only while a state value holds — the "batched steps" pattern:
   * hidden by default, visible under `while(path, when)`.
   *
   *   bricks.onlyWhile(authEmail, 'authStep', 'email')
   *   bricks.onlyWhile(verifyKey, 'authStep', ['code', 'name'])
   */
  onlyWhile(thing: Handle, path: string, when: string | number | boolean | Array<string | number | boolean>): Handle {
    this.v.make(thing).hidden()
    this.v.make(thing).while(path, when).shown()
    return thing
  }

  /**
   * A meter of labelled live cells — captions over state-bound values:
   *   bricks.cells(meter, [['m-time', 'Time', 'meter.time'], ['m-tok', 'Tokens', 'meter.tokens']])
   */
  cells(into: Handle, cells: Array<[id: string, label: string, path: string]>, looks: CellLooks = CELL_LOOKS): Handle[] {
    return cells.map(([id, label, path]) => {
      const cell = this.v.create.box(`${id}-cell`)
      this.v.make(cell).appearance(looks.cell)
      this.v.place(this.v.create.text(`${id}-label`, label)).in(cell)
      const value = this.v.create.text(id, '')
      this.v.make(value).appearance(looks.value)
      this.v.set(value).textFrom(path)
      this.v.place(value).in(cell)
      this.v.place(cell).in(into)
      return cell
    })
  }

  /**
   * A segmented control: one key per member, the active one lit by state.
   *   bricks.segmented(foot, 'theme.mode', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']])
   */
  segmented(into: Handle, stateKey: string, items: Array<[id: string, label: string]>, base = 'segKey', on = 'segOn'): Handle[] {
    return items.map(([id, label]) => {
      const key = this.v.create.button(id, label)
      this.v.make(key).appearance(base)
      this.v.make(key).while(stateKey, id).appearance(on)
      this.v.place(key).in(into)
      return key
    })
  }

  /**
   * A list whose rows follow a state array — the row becomes the template
   * stamped for every record, keyed by the field you name (default `id`).
   *   bricks.rows('log', logLine, 'log')
   */
  rows(id: string, row: Handle, path: string, key = 'id', look?: string): Handle {
    const list = this.v.create.list(id)
    if (look) this.v.make(list).appearance(look)
    this.v.place(row).in(list)
    this.v.fill(list).from(path, key)
    return list
  }
}
