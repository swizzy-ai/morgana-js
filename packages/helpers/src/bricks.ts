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
//   bricks.onlyWhile([key, field], 'authStep', 'email')  — hidden unless the state value holds
//   bricks.cells(meter, [['m-time', 'Time', 'meter.time']])  — labelled live cells
//   bricks.segmented(foot, 'theme.mode', [['system', 'System'], …])  — pill group
//   bricks.rail(top, 'view', [['pick', 'Pick'], ['brief', 'Brief'], …])  — a progress rail
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

/** Looks for a progress rail. Names are theme appearance names. */
export interface RailLooks {
  /** The rail itself. */
  rail: string
  /** One step. */
  item: string
  /** A step's bar. */
  bar: string
  /** The bar of a step already passed. */
  barDone: string
  /** The bar of the current step. */
  barOn: string
  /** A step's label. */
  label: string
}

const RAIL_LOOKS: RailLooks = { rail: 'rail', item: 'railItem', bar: 'railBar', barDone: 'railBarDone', barOn: 'railBarOn', label: 'railLabel' }

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
   *   bricks.repeat(3, () => box('bdot-0', 'bdot'), (d, i) => d.setProps({ id: `bdot-${i}` }), dots)   // placed in `dots`
   */
  repeat(count: number, build: () => Handle, configure: (clone: Handle, i: number) => void = (c) => c, into?: Handle): Handle[] {
    if (count < 1) return []
    const first = build()
    const parts = [first]
    for (let i = 1; i < count; i++) {
      const clone = first.clone() as Handle
      configure(clone, i)
      parts.push(clone)
    }
    // With `into`, every part is placed there, in order.
    if (into) for (const part of parts) this.v.place(part).in(into)
    return parts
  }

  /**
   * Shown only while a state value holds — the "batched steps" pattern:
   * hidden by default, visible under `while(path, when)`.
   *
   *   bricks.onlyWhile(authEmail, 'authStep', 'email')
   *   bricks.onlyWhile([verifyKey, backKey], 'authStep', ['code', 'name'])
   */
  onlyWhile<T extends Handle | Handle[]>(things: T, path: string, when: string | number | boolean | Array<string | number | boolean>): T {
    for (const thing of Array.isArray(things) ? things : [things]) {
      this.v.make(thing).hidden()
      this.v.make(thing).while(path, when).shown()
    }
    return things
  }

  /**
   * A meter of labelled live cells — captions over state-bound values:
   *   bricks.cells(meter, [['m-time', 'Time', 'meter.time'], ['m-tok', 'Tokens', 'meter.tokens']])
   */
  cells(into: Handle, cells: Array<[id: string, label: string, path: string]>, looks: CellLooks = CELL_LOOKS): Handle[] {
    return cells.map(([id, label, path]) => {
      const cell = this.v.create.box(`${id}-cell`)
      this.v.make(cell).appearance(looks.cell)
      const caption = this.v.create.text(`${id}-label`, label)
      this.v.make(caption).appearance(looks.label)
      this.v.place(caption).in(cell)
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
   * The state value is the id, or the third entry when they differ.
   *   bricks.segmented(foot, 'theme.mode', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']])
   *   bricks.segmented(seg, 'device', [['dev-desktop', 'Desktop', 'desktop'], ['dev-phone', 'Phone', 'phone']])
   */
  segmented(into: Handle, stateKey: string, items: Array<[id: string, label: string, value?: string]>, base = 'segKey', on = 'segOn'): Handle[] {
    return items.map(([id, label, value]) => {
      const key = this.v.create.button(id, label)
      this.v.make(key).appearance(base)
      this.v.make(key).while(stateKey, value ?? id).appearance(on)
      this.v.place(key).in(into)
      return key
    })
  }

  /**
   * A progress rail: one step per value of a state key, in order. Steps before
   * the current one look done, the current one is lit, and only the current
   * step's label shows. Ids are `<prefix>-<value>` (prefix: the rail's id).
   *   bricks.rail(top, 'view', [['pick', 'Pick'], ['brief', 'Brief'], ['work', 'Build'], ['done', 'Done']])
   */
  rail(into: Handle, stateKey: string, steps: Array<[value: string, label: string]>, id = 'rail', looks: RailLooks = RAIL_LOOKS): Handle {
    const rail = this.v.create.box(id)
    this.v.make(rail).appearance(looks.rail)
    steps.forEach(([value, label], i) => {
      const item = this.v.create.box(`${id}-${value}`)
      this.v.make(item).appearance(looks.item)
      const bar = this.v.create.box(`${id}-${value}-bar`)
      this.v.make(bar).appearance(looks.bar)
      const later = steps.slice(i + 1).map(([v]) => v)
      if (later.length) this.v.make(bar).while(stateKey, later).appearance(looks.barDone)
      this.v.make(bar).while(stateKey, value).appearance(looks.barOn)
      this.v.place(bar).in(item)
      const text = this.v.create.text(`${id}-${value}-label`, label)
      this.v.make(text).appearance(looks.label)
      this.onlyWhile(text, stateKey, value)
      this.v.place(text).in(item)
      this.v.place(item).in(rail)
    })
    this.v.place(rail).in(into)
    return rail
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
