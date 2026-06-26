import './Pagination.css'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  const go = (p) => onPageChange(Math.min(Math.max(1, p), totalPages))

  return (
    <div className="pagination">
      <div className="pagination-size">
        <label htmlFor="page-size">Per page</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="pagination-info">
        {start}–{end} of {totalItems}
      </div>

      <div className="pagination-nav">
        <button type="button" onClick={() => go(1)} disabled={currentPage === 1} title="First page">
          «
        </button>
        <button
          type="button"
          onClick={() => go(currentPage - 1)}
          disabled={currentPage === 1}
          title="Previous page"
        >
          ‹
        </button>
        <span className="pagination-page">
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => go(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Next page"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => go(totalPages)}
          disabled={currentPage >= totalPages}
          title="Last page"
        >
          »
        </button>
      </div>
    </div>
  )
}
