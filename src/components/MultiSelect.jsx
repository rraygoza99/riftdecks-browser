import { useState, useRef, useEffect } from 'react'
import './MultiSelect.css'

/**
 * Compact checkbox dropdown for selecting multiple values.
 * Closes on outside click. `selected` is an array of chosen option values.
 *
 * Pass a flat `options` array, or `groups` (an array of
 * `{ label, options: string[] }`) to render options grouped under a header.
 * A group header toggles all of its options at once; groups with a single
 * option collapse to just the header.
 */
export default function MultiSelect({ options, groups, selected, onChange, placeholder = 'All' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  // Select/deselect every option in a group at once.
  const toggleGroup = (groupOptions) => {
    const allSelected = groupOptions.every((o) => selected.includes(o))
    if (allSelected) {
      onChange(selected.filter((v) => !groupOptions.includes(v)))
    } else {
      onChange([...new Set([...selected, ...groupOptions])])
    }
  }

  // Strip the group's champion prefix from a variant, e.g.
  // "Master Yi, Wuju Master" under group "Master Yi" → "Wuju Master".
  const variantLabel = (opt, groupLabel) => {
    if (opt === groupLabel) return opt
    const stripped = opt.startsWith(groupLabel) ? opt.slice(groupLabel.length) : opt
    return stripped.replace(/^[\s,–-]+/, '').trim() || opt
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className="multiselect-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="multiselect-text">{label}</span>
        <span className="multiselect-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="multiselect-panel" role="listbox">
          {selected.length > 0 && (
            <button
              type="button"
              className="multiselect-clear"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          )}

          {groups
            ? groups.map((g) => {
                const allSel = g.options.every((o) => selected.includes(o))
                const someSel = !allSel && g.options.some((o) => selected.includes(o))
                const multi = g.options.length > 1
                return (
                  <div key={g.label} className="multiselect-group">
                    <label
                      className={`multiselect-option multiselect-group-header${
                        multi ? '' : ' multiselect-group-header--single'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={(el) => {
                          if (el) el.indeterminate = someSel
                        }}
                        onChange={() =>
                          multi ? toggleGroup(g.options) : toggle(g.options[0])
                        }
                      />
                      <span>{g.label}</span>
                    </label>
                    {multi &&
                      g.options.map((opt) => (
                        <label
                          key={opt}
                          className="multiselect-option multiselect-option--nested"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(opt)}
                            onChange={() => toggle(opt)}
                          />
                          <span>{variantLabel(opt, g.label)}</span>
                        </label>
                      ))}
                  </div>
                )
              })
            : options.map((opt) => (
                <label key={opt} className="multiselect-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
        </div>
      )}
    </div>
  )
}
