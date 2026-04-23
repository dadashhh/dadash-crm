import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
  info?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DADASH v2] Error caught by boundary:', error, info);
    this.setState({ error, info });
  }

  reset = () => this.setState({ hasError: false, error: undefined, info: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#070912', color: '#eef2ff', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 520, padding: 24, borderRadius: 18, border: '1px solid rgba(251,113,133,0.3)', background: '#0f1423' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Erreur de rendu</div>
          <div style={{ fontSize: 13, color: '#b8c4e0', marginBottom: 16 }}>
            Un composant de la page a planté. Les autres pages fonctionnent — essaie de naviguer via la sidebar.
          </div>
          {this.state.error && (
            <pre style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', background: '#131929', padding: 12, borderRadius: 10, color: '#fb7185', overflow: 'auto', maxHeight: 240 }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
          <button onClick={this.reset} style={{ marginTop: 16, padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#818cf8,#6366f1)', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Réessayer
          </button>
          <button onClick={() => window.location.reload()} style={{ marginLeft: 8, marginTop: 16, padding: '8px 18px', borderRadius: 10, background: 'transparent', color: '#b8c4e0', border: '1px solid rgba(129,140,248,0.14)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
