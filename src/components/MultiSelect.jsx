import { useState, useRef, useEffect } from 'react'
import './MultiSelect.css'

/**
 * Compact checkbox dropdown for selecting multiple values.
 * Closes on outside click. `selected` is an array of chosen option values.
 */
export default function MultiSelect({ options, selected, onChange, placeholder = 'All' }) {
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
          {options.map((opt) => (
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
