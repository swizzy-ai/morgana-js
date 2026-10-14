import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Inputs & forms — button, input, select, toggle, form, progress.
 * Same contract as the basic page: knobs in client/knobsInput, log under each.
 */
export const objectsInput = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-input',
      address: 'objects-input',
      title: 'Inputs & forms — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'input', 'Inputs & forms', 'Button, input, select, toggle, form, progress — live, with knobs.')

    // ── Button ──
    {
      const { stage } = placeView(ctx, content, 'button', 'Button', 'Label, variant, disabled.', [
        { id: 'd-button-label', kind: 'input', label: 'label', value: 'Press me' },
        { id: 'd-button-variant', kind: 'select', label: 'variant', options: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success'], value: 'primary' },
        { id: 'd-button-disabled', kind: 'toggle', label: 'disabled', value: 'false' },
      ])
      stage.place(ctx.ui.button({ id: 'd-button-target', label: 'Press me', variant: 'primary' }))
    }

    // ── Input ──
    {
      const { stage } = placeView(ctx, content, 'field', 'Input', 'Placeholder, value, type, disabled. Type in it — the log shows changed.', [
        { id: 'd-field-placeholder', kind: 'input', label: 'placeholder', value: 'Type something…' },
        { id: 'd-field-type', kind: 'select', label: 'type', options: ['text', 'password', 'number', 'email'] },
        { id: 'd-field-disabled', kind: 'toggle', label: 'disabled', value: 'false' },
      ])
      stage.place(ctx.ui.input({ id: 'd-field-target', placeholder: 'Type something…', value: '' }))
    }

    // ── Select ──
    {
      const { stage } = placeView(ctx, content, 'pick', 'Select', 'Options, value, searchable, clearable.', [
        { id: 'd-pick-value', kind: 'select', label: 'value', options: ['apple', 'banana', 'cherry'], value: 'banana' },
        { id: 'd-pick-searchable', kind: 'toggle', label: 'searchable', value: 'false' },
        { id: 'd-pick-clearable', kind: 'toggle', label: 'clearable', value: 'false' },
      ])
      stage.place(
        ctx.ui.select({
          id: 'd-pick-target',
          options: [
            { label: 'apple', value: 'apple' },
            { label: 'banana', value: 'banana' },
            { label: 'cherry', value: 'cherry' },
          ],
          value: 'banana',
        }),
      )
    }

    // ── Toggle ──
    {
      const { stage } = placeView(ctx, content, 'switch', 'Toggle', 'Label, checked, size, kind (switch vs checkbox).', [
        { id: 'd-switch-label', kind: 'input', label: 'label', value: 'Airplane mode' },
        { id: 'd-switch-checked', kind: 'toggle', label: 'checked', value: 'false' },
        { id: 'd-switch-size', kind: 'select', label: 'size', options: ['sm', 'md', 'lg'], value: 'md' },
        { id: 'd-switch-kind', kind: 'select', label: 'kind', options: ['switch', 'checkbox'], value: 'switch' },
      ])
      stage.place(ctx.ui.toggle({ id: 'd-switch-target', label: 'Airplane mode', checked: false }))
    }

    // ── Textarea ──
    {
      const { stage } = placeView(ctx, content, 'area', 'Textarea', 'Multi-line input. Same handle family as input: value, placeholder, rows, disabled.', [
        { id: 'd-area-placeholder', kind: 'input', label: 'placeholder', value: 'Write a few lines…' },
        { id: 'd-area-rows', kind: 'select', label: 'rows', options: ['3', '5', '8'], value: '3' },
        { id: 'd-area-disabled', kind: 'toggle', label: 'disabled', value: 'false' },
      ])
      stage.place(ctx.ui.textarea({ id: 'd-area-target', placeholder: 'Write a few lines…', value: '', rows: 3 }))
    }

    // ── Label ──
    {
      const { stage } = placeView(ctx, content, 'lbl', 'Label', 'Form caption with a for-target. Text and association, both live.', [
        { id: 'd-tag-content', kind: 'input', label: 'content', value: 'Your name' },
        { id: 'd-tag-for', kind: 'select', label: 'for', options: ['d-form-name', 'd-form-email', 'd-field-target'], value: 'd-form-name' },
      ])
      stage.place(ctx.ui.label({ id: 'd-tag-target', content: 'Your name', for: 'd-form-name' }))
    }

    // ── Form ──
    {
      const { stage } = placeView(ctx, content, 'form', 'Form', 'A real form with fields. Press "Read values" to see getValues() output below.', [
        { id: 'd-form-layout', kind: 'select', label: 'layout', options: ['vertical', 'horizontal', 'inline'] },
      ])
      const form = ctx.ui.form({ id: 'd-form-target', layout: 'vertical' })
      form.place(ctx.ui.input({ id: 'd-form-name', name: 'name', placeholder: 'Your name', value: '' }))
      form.place(ctx.ui.input({ id: 'd-form-email', name: 'email', placeholder: 'you@example.com', value: '' }))
      stage.place(form)
      stage.place(ctx.ui.button({ id: 'd-form-read', label: 'Read values', variant: 'outline' }))
      stage.place(ctx.ui.text({ id: 'd-form-out', content: 'values appear here', font: 'mono' }))
    }

    // ── Number ──
    {
      const { stage } = placeView(ctx, content, 'num', 'Number input', 'Value with steppers. Type, click +/−, or drive the knob — clamped through min/max/step.', [
        { id: 'd-num-value', kind: 'input', label: 'value', value: '4' },
        { id: 'd-num-step', kind: 'select', label: 'step', options: ['1', '2', '5'], value: '2' },
      ])
      stage.place(ctx.ui.numberInput({ id: 'd-num-target', value: 4, min: 0, max: 10, step: 2 }))
    }

    // ── Pin ──
    {
      const { stage } = placeView(ctx, content, 'pin', 'Pin input', 'One-time code boxes. Type to advance, Backspace to go back, fill all four for the complete event.', [
        { id: 'd-pin-value', kind: 'input', label: 'set value', value: '' },
      ])
      const row = ctx.ui.box({ id: 'd-pin-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-pin-clear', label: 'Clear', variant: 'outline' }))
      stage.place(row)
      stage.place(ctx.ui.pinInput({ id: 'd-pin-target', length: 4 }))
    }

    // ── Slider ──
    {
      const { stage } = placeView(ctx, content, 'slide', 'Slider', 'Value, min, max, step, size. Drag it or drive it from the knob — the log hears both.', [
        { id: 'd-slide-value', kind: 'input', label: 'value', value: '40' },
        { id: 'd-slide-step', kind: 'select', label: 'step', options: ['1', '5', '10'], value: '5' },
        { id: 'd-slide-size', kind: 'select', label: 'size', options: ['sm', 'md', 'lg'], value: 'md' },
      ])
      stage.place(ctx.ui.slider({ id: 'd-slide-target', value: 40, min: 0, max: 100, step: 5, showValue: true }))
    }

    // ── Progress ──
    {
      const { stage } = placeView(ctx, content, 'progress', 'Progress', 'Value, max, variant, striped, animated, label.', [
        { id: 'd-progress-value', kind: 'input', label: 'value', value: '40' },
        { id: 'd-progress-variant', kind: 'select', label: 'variant', options: ['emerald', 'sky', 'amber', 'rose', 'purple'] },
        { id: 'd-progress-striped', kind: 'toggle', label: 'striped', value: 'false' },
        { id: 'd-progress-animated', kind: 'toggle', label: 'animated', value: 'false' },
        { id: 'd-progress-label', kind: 'toggle', label: 'showLabel', value: 'true' },
      ])
      stage.place(ctx.ui.progress({ id: 'd-progress-target', value: 40, max: 100, variant: 'sky', showLabel: true }))
    }

    return { ok: true }
  },
})
