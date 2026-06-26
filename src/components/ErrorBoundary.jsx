import React from 'react';

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
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'center', height:'100vh', background:'#f8f6f1',
                    fontFamily:'Nunito, sans-serif', textAlign:'center', padding:'2rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>EcoGuesser</div>
        <h2 style={{ color:'#111827', fontSize:'1.25rem', marginBottom:'0.5rem' }}>
          Something went wrong
        </h2>
        <p style={{ color:'#6b7280', marginBottom:'1.5rem' }}>Please refresh to try again.</p>
        <button onClick={() => window.location.reload()}
          style={{ padding:'0.75rem 1.5rem', background:'#16a34a', color:'#fff',
                   border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'1rem' }}>
          Refresh
        </button>
      </div>
    );
  }
}
