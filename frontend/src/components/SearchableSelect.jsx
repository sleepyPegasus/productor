import { useState, useRef, useEffect, useMemo } from 'react'
import './SearchableSelect.css'

export default function SearchableSelect({ options, value, onChange, placeholder = '请选择...' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    )
  }, [options, search])

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => o.id === value)
    return found ? found.name : ''
  }, [options, value])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const handleSelect = (id) => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="searchable-select" ref={containerRef}>
      <div
        className={`searchable-select-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className={`searchable-select-value ${selectedLabel ? '' : 'placeholder'}`}>
          {selectedLabel || placeholder}
        </span>
        <span className={`searchable-select-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </div>
      {open && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search-wrap">
            <input
              ref={inputRef}
              type="text"
              className="searchable-select-search"
              placeholder="搜索模型..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="searchable-select-options">
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">无匹配结果</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.id}
                  className={`searchable-select-option ${o.id === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(o.id)}
                  title={o.id}
                >
                  <span className="option-name">{o.name}</span>
                  <span className="option-id">{o.id}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
