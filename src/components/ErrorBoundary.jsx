import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>The page hit an unexpected error. Try reloading.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
