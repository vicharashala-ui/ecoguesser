import React from 'react';
import './ErrorBoundary.css';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    console.error('EcoGuesser:', err, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="eg-app-shell-height eg-error-boundary">
        <div className="eg-error-wordmark">
          EcoGuesser<sup>™</sup>
        </div>
        <h2 className="eg-error-heading">This screen crashed</h2>
        <p className="eg-error-body">
          Refresh to continue — your stats and progress are saved, so nothing's lost.
        </p>
        <button
          type="button"
          className="eg-error-refresh-btn"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    );
  }
}

