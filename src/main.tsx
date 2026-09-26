import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center" role="alert">
          <h1 className="font-bold text-xl">Spendly n'a pas pu s'afficher.</h1>
          <p className="text-sm text-secondary mt-2">Recharge l'application pour réessayer.</p>
          <button
            className="mt-5 px-4 py-2 rounded-lg bg-primary text-white font-bold"
            onClick={() => window.location.reload()}
          >
            Recharger
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
